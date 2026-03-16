import { io } from 'socket.io-client';
import { createRunLogger, wrapHandlers } from './logger.mjs';
import { loadRpcable } from './loadRpcable.mjs';

function waitForConnect(socket, logger, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`[rpcable-session-lab] socket.io connect timeout (${timeoutMs}ms)`));
        }, timeoutMs);

        const onConnect = async () => {
            cleanup();
            await logger.write('socketio:connected', { socketId: socket.id });
            resolve();
        };

        const onError = async (error) => {
            cleanup();
            await logger.write('socketio:connect-error', {
                message: error?.message || String(error),
            });
            reject(error instanceof Error ? error : new Error(String(error)));
        };

        function cleanup() {
            clearTimeout(timer);
            socket.off('connect', onConnect);
            socket.off('connect_error', onError);
        }

        socket.on('connect', onConnect);
        socket.on('connect_error', onError);
    });
}

export async function createSocketIoSession({
    label = 'socketio-session',
    url,
    channel = '-userSession',
    target = {},
    socketOptions = {},
    receiverOptions = {},
    connectTimeoutMs = 8000,
} = {}) {
    if (!url) {
        throw new Error('[rpcable-session-lab] url is required for socket.io sessions');
    }

    const logger = await createRunLogger({ label });
    const loggedTarget = wrapHandlers(target, logger, 'push');

    const socket = io(url, {
        autoConnect: false,
        transports: ['websocket'],
        ...socketOptions,
    });

    const rawEmit = socket.emit.bind(socket);
    socket.emit = (event, ...args) => {
        if (event === channel) {
            void logger.write('socketio:emit', { event, batch: args[0] });
        }
        return rawEmit(event, ...args);
    };

    socket.onAny((event, ...args) => {
        if (event === channel) {
            void logger.write('socketio:inbound', { event, batch: args[0] });
            return;
        }
        void logger.write('socketio:event', { event, args });
    });

    const { RpcAble, RpcAbleReceiver } = await loadRpcable();
    const receiver = new RpcAbleReceiver({ target: loggedTarget, ...receiverOptions });

    socket.on(channel, (batch) => {
        receiver.dispatch(batch)
            .then((results) => logger.write('socketio:dispatch', { batch, results }))
            .catch((error) => logger.write('socketio:dispatch-error', {
                message: error?.message || String(error),
                stack: error?.stack,
            }));
    });

    socket.connect();
    await waitForConnect(socket, logger, connectTimeoutMs);

    const userSession = new RpcAble({
        transport: 'socketio',
        socket,
        channel,
        target: loggedTarget,
    });

    await logger.write('session:ready', {
        transport: 'socketio',
        url,
        channel,
        socketId: socket.id,
        socketOptions,
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
            await logger.write('session:closed', { transport: 'socketio' });
            await logger.close();
        },
    };
}
