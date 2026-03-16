import { createSocketIoSession } from '../lib/socketioSession.mjs';

const url = process.env.RPCABLE_URL || 'http://localhost:3100';
const channel = process.env.RPCABLE_CHANNEL || '-userSession';
const displayName = process.env.RPCABLE_NAME || 'Carmelo';
const waitMs = Number(process.env.RPCABLE_WAIT_MS || 500);
const socketOptions = process.env.RPCABLE_SOCKET_OPTIONS
    ? JSON.parse(process.env.RPCABLE_SOCKET_OPTIONS)
    : {};

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

const session = await createSocketIoSession({
    label: `socketio-${displayName.toLowerCase()}`,
    url,
    channel,
    target,
    socketOptions,
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

console.log(`Socket.io scenario finished. Logs: ${session.runDir}`);
