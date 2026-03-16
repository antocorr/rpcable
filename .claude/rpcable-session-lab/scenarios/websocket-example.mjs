import { createWebSocketSession } from '../lib/websocketSession.mjs';

const url = process.env.RPCABLE_URL || 'ws://localhost:3300';
const channel = process.env.RPCABLE_CHANNEL || '-userSession';
const displayName = process.env.RPCABLE_NAME || 'Carmelo';
const waitMs = Number(process.env.RPCABLE_WAIT_MS || 500);
const headers = process.env.RPCABLE_HEADERS_JSON
    ? JSON.parse(process.env.RPCABLE_HEADERS_JSON)
    : {};
const protocols = process.env.RPCABLE_PROTOCOLS_JSON
    ? JSON.parse(process.env.RPCABLE_PROTOCOLS_JSON)
    : undefined;

const target = {
    joined(payload) {
        return payload;
    },
    gamesReceived(games) {
        return games;
    },
    pong(payload) {
        return payload;
    },
};

const session = await createWebSocketSession({
    label: `websocket-${displayName.toLowerCase()}`,
    url,
    channel,
    target,
    protocols,
    headers,
});

try {
    const joinResult = await session.userSession.join.request({ name: displayName });
    await session.logger.write('scenario:join-result', { joinResult });

    const gamesCount = await session.userSession.getGames.request();
    await session.logger.write('scenario:getGames-result', { gamesCount });

    session.userSession.ping();
    await new Promise((resolve) => setTimeout(resolve, waitMs));
} finally {
    await session.close();
}

console.log(`WebSocket scenario finished. Logs: ${session.runDir}`);
