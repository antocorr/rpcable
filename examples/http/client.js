/**
 * Example HTTP client
 * Run in browser or: bun client.js
 */
import { RpcAble } from '../../src/RpcAble.js';

class Session {
    joined({ user }) {
        console.log('joined as', user.name);
    }
}

const session = new Session();

const userSession = new RpcAble({
    transport: 'http',
    endpoint: 'http://localhost:3000/rpc/user-session',
    target: session,
});

userSession.extend({
    gamesReceived(games) {
        console.log('push gamesReceived', games);
    },
    'scenes.deleted': ({ sceneId }) => {
        console.log('push scenes.deleted', sceneId);
    },
});

// Single call
const joined = await userSession.join({ user: 'antocorr', motto: 'Bubblejs is awesome!' });
console.log(joined);
// → { success: true, welcomedAs: 'antocorr' }

// Batched — both calls go in one POST because they're in the same tick
const [games, scenes] = await Promise.all([
    userSession.getGames(),
    userSession.scenes.getAll(),
]);
console.log(games);  // → 2 (server returned games.length)
console.log(scenes); // → [{ id: 1, name: 'Intro' }]

// Namespace call
const deleted = await userSession.scenes.delete({ sceneId: 1 });
console.log(deleted); // → { deleted: 1 }
