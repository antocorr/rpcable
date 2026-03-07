import { RpcAble, RpcAbleReceiver } from 'rpcable';
import socket from './socket.js'; // your socket.io client instance

const CHANNEL = '-userSession';

class Session {
    // Only put here what is genuinely shared across multiple views.
    // Per-view callbacks go in that view via userSession.extend().

    joined({ user }) {
        // Server confirms connection. Store auth state here.
        // e.g. authStore.set(user);
    }
}

const session = new Session();

export const userSession = new RpcAble({
    transport: 'socketio',
    socket,
    channel: CHANNEL,
    target: session,
});

userSession.extend({
    gamesReceived(games) {
        // optional: update shared store
        // e.g. gamesStore.set(games);
    },
    'scenes.deleted': ({ sceneId }) => {
        // optional: notify current view
        // e.g. toast(`Scene ${sceneId} deleted`);
    },
});

const receiver = new RpcAbleReceiver({ target: session });
socket.on(CHANNEL, (batch) => receiver.receive(batch));
