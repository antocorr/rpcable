import { createRunLogger, maybeJson, wrapHandlers } from './logger.mjs';
import { loadRpcable } from './loadRpcable.mjs';

export async function createHttpSession({
    label = 'http-session',
    endpoint,
    headers = {},
    target = {},
    fetchImpl = globalThis.fetch,
    requestTimeoutMs,
} = {}) {
    if (!endpoint) {
        throw new Error('[rpcable-session-lab] endpoint is required for HTTP sessions');
    }

    if (typeof fetchImpl !== 'function') {
        throw new Error('[rpcable-session-lab] fetch implementation is required for HTTP sessions');
    }

    const logger = await createRunLogger({ label });
    const loggedTarget = wrapHandlers(target, logger, 'push');

    const tracedFetch = async (url, init = {}) => {
        await logger.write('http:request', {
            url,
            method: init.method ?? 'GET',
            headers: init.headers,
            body: maybeJson(typeof init.body === 'string' ? init.body : null),
        });

        const response = await fetchImpl(url, init);
        const responseText = await response.text();

        await logger.write('http:response', {
            url,
            status: response.status,
            ok: response.ok,
            body: maybeJson(responseText),
        });

        return new Response(responseText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    };

    const { RpcAble } = await loadRpcable();
    const userSession = new RpcAble({
        transport: 'http',
        endpoint,
        headers,
        target: loggedTarget,
        fetchImpl: tracedFetch,
        requestTimeoutMs,
    });

    await logger.write('session:ready', {
        transport: 'http',
        endpoint,
        headers,
    });

    return {
        userSession,
        target: loggedTarget,
        logger,
        runDir: logger.runDir,
    };
}
