import WebSocket from 'ws';
import { createRunLogger, maybeJson, wrapHandlers } from './logger.mjs';
import { loadRpcable } from './loadRpcable.mjs';

function createSocket(url, protocols, headers) {
    const hasHeaders = headers && Object.keys(headers).length > 0;

    if (!protocols && !hasHeaders) {
        return new WebSocket(url);
    }

    if (!protocols && hasHeaders) {
        return new WebSocket(url, [], { headers });
    }

    return new WebSocket(url, protocols, hasHeaders ? { headers } : undefined);
}

function waitForOpen(socket, logger, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`[rpcable-session-lab] websocket connect timeout (${timeoutMs}ms)`));
        }, timeoutMs);

        const onOpen = async () => {
            cleanup();
            await logger.write('websocket:open', {});
            resolve();
        };

        const onError = async (error) => {
            cleanup();
            await logger.write('websocket:error', {
                message: error?.message || String(error),
                stack: error?.stack,
            });
            reject(error instanceof Error ? error : new Error(String(error)));
        };

        function cleanup() {
            clearTimeout(timer);
            socket.off('open', onOpen);
            socket.off('error', onError);
        }

        socket.on('open', onOpen);
        socket.on('error', onError);
    });
}

export async function createWebSocketSession({
    label = 'websocket-session',
    url,
    channel = '-userSession',
    target = {},
    protocols,
    headers = {},
    receiverOptions = {},
    connectTimeoutMs = 8000,
} = {}) {
    if (!url) {
        throw new Error('[rpcable-session-lab] url is required for websocket sessions');
    }

    const logger = await createRunLogger({ label });
    const loggedTarget = wrapHandlers(target, logger, 'push');
    const { RpcAble, RpcAbleReceiver, decodeRpcMessage } = await loadRpcable();

    const socket = createSocket(url, protocols, headers);
    const rawSend = socket.send.bind(socket);

    socket.send = (payload, ...args) => {
        void logger.write('websocket:send', { payload: maybeJson(payload) });
        return rawSend(payload, ...args);
    };

    const receiver = new RpcAbleReceiver({ target: loggedTarget, ...receiverOptions });

    socket.on('message', (data) => {
        const decoded = decodeRpcMessage(data, channel);
        void logger.write('websocket:message', {
            raw: maybeJson(data),
            decoded,
        });

        if (!decoded) {
            return;
        }

        receiver.dispatch(decoded)
            .then((results) => logger.write('websocket:dispatch', { batch: decoded, results }))
            .catch((error) => logger.write('websocket:dispatch-error', {
                message: error?.message || String(error),
                stack: error?.stack,
            }));
    });

    socket.on('close', (code, reason) => {
        void logger.write('websocket:close', {
            code,
            reason: maybeJson(reason),
        });
    });

    await waitForOpen(socket, logger, connectTimeoutMs);

    const userSession = new RpcAble({
        transport: 'websocket',
        socket,
        channel,
        target: loggedTarget,
    });

    await logger.write('session:ready', {
        transport: 'websocket',
        url,
        channel,
        headers,
    });

    return {
        socket,
        userSession,
        target: loggedTarget,
        receiver,
        logger,
        runDir: logger.runDir,
        close: async () => {
            socket.close();
            await logger.write('session:closed', { transport: 'websocket' });
            await logger.close();
        },
    };
}
