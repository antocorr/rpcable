import { createHttpSession } from '../lib/httpSession.mjs';

const endpoint = process.env.RPCABLE_ENDPOINT || 'http://localhost:3200/rpc/user-session';
const sessionId = process.env.RPCABLE_SESSION_ID || 'debug-carmelo';
const displayName = process.env.RPCABLE_NAME || 'Carmelo';
const waitMs = Number(process.env.RPCABLE_WAIT_MS || 500);

const target = {
    joined(payload) {
        return payload;
    },
    gamesReceived(games) {
        return games;
    },
    readMessage(message) {
        return message;
    },
};

const session = await createHttpSession({
    label: `http-${sessionId}`,
    endpoint,
    headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId,
    },
    target,
});

try {
    const joinResult = await session.userSession.join({ name: displayName }).request();
    await session.logger.write('scenario:join-result', { joinResult });

    const gamesCount = await session.userSession.getGames().request();
    await session.logger.write('scenario:getGames-result', { gamesCount });

    await new Promise((resolve) => setTimeout(resolve, waitMs));
} finally {
    await session.logger.close();
}

console.log(`HTTP scenario finished. Logs: ${session.runDir}`);
