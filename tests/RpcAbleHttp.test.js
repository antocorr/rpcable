import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { RpcAble, RpcAbleReceiver } from '../src/RpcAble.js';

let mockFetch;

beforeEach(() => {
    mockFetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        const results = body.map(entry => entry.path.join('.'));
        return {
            ok: true,
            json: async () => ({ results, push: [] }),
        };
    });
    globalThis.fetch = mockFetch;
});

afterEach(() => {
    delete globalThis.fetch;
});

describe('RpcAble http transport', () => {
    test('a single call resolves with the server return value', async () => {
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        expect(await client.getGames()).toBe('getGames');
    });

    test('concurrent calls are batched into one fetch', async () => {
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        const [a, b] = await Promise.all([client.foo(), client.bar()]);
        expect(mockFetch.mock.calls).toHaveLength(1);
        expect(a).toBe('foo');
        expect(b).toBe('bar');
    });

    test('supports namespace path', async () => {
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        expect(await client.scenes.getAll()).toBe('scenes.getAll');
    });

    test('posts to the correct endpoint', async () => {
        const client = new RpcAble({ transport: 'http', endpoint: '/my/endpoint' });
        await client.ping();
        expect(mockFetch.mock.calls[0][0]).toBe('/my/endpoint');
    });

    test('sends args in the request body', async () => {
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        await client.deleteUser({ userId: '7' });
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body[0].args).toEqual([{ userId: '7' }]);
    });

    test('rejects all pending calls on fetch error', async () => {
        globalThis.fetch = mock(async () => ({ ok: false, status: 500 }));
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        await expect(Promise.resolve(client.fail())).rejects.toThrow('HTTP 500');
    });

    test('calls in different ticks are separate fetches', async () => {
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        await client.first();
        await client.second();
        expect(mockFetch.mock.calls).toHaveLength(2);
    });

    test('invokes fetch with globalThis context', async () => {
        let seenThis = null;
        function strictFetch() {
            seenThis = this;
            return Promise.resolve({
                ok: true,
                json: async () => ({ results: ['ok'], push: [] }),
            });
        }

        globalThis.fetch = strictFetch;
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        expect(await client.ping()).toBe('ok');
        expect(seenThis).toBe(globalThis);
    });

    test('can wrap an object and access its own methods', async () => {
        class Session {
            localHelper() { return 'local'; }
        }
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc', target: new Session() });
        expect(client.localHelper()).toBe('local');
    });

    test('.request() resolves to the same value as direct await', async () => {
        const client = new RpcAble({ transport: 'http', endpoint: '/rpc' });
        expect(await client.getGames().request()).toBe('getGames');
        expect(await client.getGames().expects()).toBe('getGames');
    });

    test('processes push items from HTTP response on the local target', async () => {
        const session = {
            pushed: null,
            gamesReceived(games) {
                this.pushed = games;
            },
        };

        globalThis.fetch = mock(async () => ({
            ok: true,
            json: async () => ({
                results: ['ok'],
                push: [{ path: ['gamesReceived'], args: [[1, 2, 3]] }],
            }),
        }));

        const client = new RpcAble({ transport: 'http', endpoint: '/rpc', target: session });
        expect(await client.getGames()).toBe('ok');
        await Promise.resolve();
        expect(session.pushed).toEqual([1, 2, 3]);
    });
});

describe('collector + receiver pending flow (HTTP server-side pattern)', () => {
    test('pending push is delivered on next request and then cleared', async () => {
        class UserSession {
            constructor() {
                this.client = new RpcAble({ transport: 'collector' });
                this.receiver = new RpcAbleReceiver({ target: this });
            }

            async ping() {
                return 'pong';
            }
        }

        const session = new UserSession();

        session.client.newMessage({ text: 'ciao' });
        await Promise.resolve();

        const results = await session.receiver.dispatch([
            { path: ['ping'], args: [] },
        ], { role: 'user' });

        const push = session.client.flush();
        const nextPush = session.client.flush();

        expect(results).toEqual(['pong']);
        expect(push).toEqual([
            { path: ['newMessage'], args: [{ text: 'ciao' }] },
        ]);
        expect(nextPush).toEqual([]);
    });
});
