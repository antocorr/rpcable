import { describe, test, expect } from 'bun:test';
import { RpcAble, RpcAbleReceiver, encodeRpcMessage, decodeRpcMessage } from '../src/RpcAble.js';

function makeSocket() {
    const emitted = [];
    return {
        emit: (event, data) => emitted.push({ event, data }),
        _emitted: emitted,
    };
}

function makeSession(socket, channel = 'ch') {
    class Session {}
    const session = new Session();
    const client = new RpcAble({ transport: 'socketio', socket, channel, target: session });
    session.client = client;
    return { session, client };
}

describe('RpcAble socketio transport', () => {
    test('batches calls in the same microtask into one emit', async () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });

        client.getGames();
        client.getUsers();
        await Promise.resolve();

        expect(socket._emitted).toHaveLength(1);
        expect(socket._emitted[0].event).toBe('ch');
        expect(socket._emitted[0].data).toEqual([
            { path: ['getGames'], args: [] },
            { path: ['getUsers'], args: [] },
        ]);
    });

    test('sends args correctly', async () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });

        client.deleteUser({ userId: '42' });
        await Promise.resolve();

        expect(socket._emitted[0].data[0]).toEqual({
            path: ['deleteUser'],
            args: [{ userId: '42' }],
        });
    });

    test('supports namespace chaining', async () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });

        client.scenes.getAll();
        await Promise.resolve();

        expect(socket._emitted[0].data[0].path).toEqual(['scenes', 'getAll']);
    });

    test('calls in different ticks are separate emits', async () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });

        client.foo();
        await Promise.resolve();
        client.bar();
        await Promise.resolve();

        expect(socket._emitted).toHaveLength(2);
    });

    test('extend adds methods to target', () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });
        let called = false;

        client.extend({ onData: () => { called = true; } });
        client.onData();

        expect(called).toBe(true);
    });

    test('extend supports dot notation for namespaces', () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });
        let called = false;

        client.extend({
            'scenes.listed': () => {
                called = true;
            },
        });

        client.scenes.listed();
        expect(called).toBe(true);
    });

    test('extendOnce only registers once per keyword', () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });
        let count = 0;

        client.extendOnce('myKey', { cb: () => { count++; } });
        client.extendOnce('myKey', { cb: () => { count += 100; } });
        client.cb();

        expect(count).toBe(1);
    });

    test('awaiting a fire-and-forget call throws a helpful error', () => {
        const socket = makeSocket();
        const client = new RpcAble({ transport: 'socketio', socket, channel: 'ch' });
        const ticket = client.getGames();

        expect(() => ticket.then()).toThrow('fire-and-forget');
        expect(() => ticket.catch()).toThrow('fire-and-forget');
        expect(() => ticket.finally()).toThrow('fire-and-forget');
    });
});

describe('RpcAble request/response over websocket-like transports', () => {
    test('request() sends --request envelope and resolves on --response', async () => {
        const socket = makeSocket();
        const { session } = makeSession(socket);

        const promise = session.client.getGames().request();
        await Promise.resolve();

        const batch = socket._emitted[0].data;
        expect(batch[0].path).toEqual(['--request']);
        const reqId = batch[0].args[0].id;

        session['--response']({ id: reqId, ok: true, result: [1, 2, 3] });
        expect(await promise).toEqual([1, 2, 3]);
    });

    test('expects() is an alias for request()', async () => {
        const socket = makeSocket();
        const { session } = makeSession(socket);

        const promise = session.client.getGames().expects();
        await Promise.resolve();

        const reqId = socket._emitted[0].data[0].args[0].id;
        session['--response']({ id: reqId, ok: true, result: 'ok' });
        expect(await promise).toBe('ok');
    });

    test('request() rejects on error response', async () => {
        const socket = makeSocket();
        const { session } = makeSession(socket);

        const promise = session.client.doSomething().request();
        await Promise.resolve();

        const reqId = socket._emitted[0].data[0].args[0].id;
        session['--response']({ id: reqId, ok: false, error: { name: 'Error', message: 'bad' } });
        await expect(promise).rejects.toThrow('bad');
    });

    test('multiple concurrent request() calls resolve independently', async () => {
        const socket = makeSocket();
        const { session } = makeSession(socket);

        const p1 = session.client.foo().request();
        const p2 = session.client.bar().request();
        await Promise.resolve();

        const batch = socket._emitted[0].data;
        const id1 = batch[0].args[0].id;
        const id2 = batch[1].args[0].id;

        session['--response']({ id: id2, ok: true, result: 'b' });
        session['--response']({ id: id1, ok: true, result: 'a' });

        expect(await p1).toBe('a');
        expect(await p2).toBe('b');
    });

    test('request() called after flush rejects immediately', async () => {
        const socket = makeSocket();
        const { session } = makeSession(socket);

        const ticket = session.client.foo();
        await Promise.resolve();

        await expect(ticket.request()).rejects.toThrow('same tick');
    });
});

describe('RpcAble collector transport', () => {
    test('collects calls and flushes them', async () => {
        const collector = new RpcAble({ transport: 'collector' });

        collector.notifications.newMessage({ text: 'hi' });
        collector.badge.set(3);
        await Promise.resolve();

        expect(collector.flush()).toEqual([
            { path: ['notifications', 'newMessage'], args: [{ text: 'hi' }] },
            { path: ['badge', 'set'], args: [3] },
        ]);
        expect(collector.flush()).toEqual([]);
    });

    test('request() is not supported on collector', async () => {
        const collector = new RpcAble({ transport: 'collector' });
        const ticket = collector.foo();
        await expect(ticket.request()).rejects.toThrow('does not support request');
    });
});

describe('RpcAble destroy', () => {
    test('destroy() rejects all pending requests immediately', async () => {
        const socket = makeSocket();
        const { session } = makeSession(socket);

        const p1 = session.client.foo().request();
        const p2 = session.client.bar().request();
        await Promise.resolve();

        session.client.destroy();

        await expect(p1).rejects.toThrow('destroyed');
        await expect(p2).rejects.toThrow('destroyed');
    });

    test('destroy() clears the collector queue', async () => {
        const collector = new RpcAble({ transport: 'collector' });
        collector.foo();
        await Promise.resolve();
        collector.destroy();
        expect(collector.flush()).toEqual([]);
    });
});

describe('RpcAbleReceiver', () => {
    test('dispatch invokes a method and returns results', async () => {
        class Target {
            getGames() { return [1, 2, 3]; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['getGames'], args: [] },
        ]);
        expect(result).toEqual([1, 2, 3]);
    });

    test('dispatch passes args correctly', async () => {
        class Target {
            add(a, b) { return a + b; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['add'], args: [2, 3] },
        ]);
        expect(result).toBe(5);
    });

    test('dispatch supports namespace path', async () => {
        class Target {
            scenes = { getAll() { return ['s1']; } };
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['scenes', 'getAll'], args: [] },
        ]);
        expect(result).toEqual(['s1']);
    });

    test('dispatch awaits async methods', async () => {
        class Target {
            async getItems() { return ['a', 'b']; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['getItems'], args: [] },
        ]);
        expect(result).toEqual(['a', 'b']);
    });

    test('.set convention mutates a property', async () => {
        class Target { count = 0; }
        const target = new Target();
        await new RpcAbleReceiver({ target }).dispatch([
            { path: ['count', 'set'], args: [42] },
        ]);
        expect(target.count).toBe(42);
    });

    test('missing method returns undefined and logs error', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        class Target {}
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['missing'], args: [] },
        ]);

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('missing');
    });

    test('dispatch returns a Promise', () => {
        class Target { greet() { return 'hi'; } }
        const result = new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['greet'], args: [] },
        ]);
        expect(result).toBeInstanceOf(Promise);
    });

    test('dispatch accepts role in options', async () => {
        class Target {
            whoAmI(_, role) { return role; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['whoAmI'], args: [null] },
        ], { role: 'admin' });
        expect(result).toBe('admin');
    });


    test('permissions block forbidden roles', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        class Target {
            permissions = { deleteAll: ['superadmin'] };
            deleteAll() { return 'deleted'; }
        }
        const receiver = new RpcAbleReceiver({ target: new Target() });
        const [result] = await receiver.dispatch([
            { path: ['deleteAll'], args: [] },
        ], { role: 'user' });

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('access denied');
    });

    test('permissions allow matching role', async () => {
        class Target {
            permissions = { secret: ['admin'] };
            secret() { return 'ok'; }
        }
        const receiver = new RpcAbleReceiver({ target: new Target() });
        const [result] = await receiver.dispatch([
            { path: ['secret'], args: [] },
        ], { role: 'admin' });
        expect(result).toBe('ok');
    });

    test('permissions with falsy value block all roles', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        class Target {
            permissions = { deleteAll: false };
            deleteAll() { return 'deleted'; }
        }
        const receiver = new RpcAbleReceiver({ target: new Target() });
        const [result] = await receiver.dispatch([
            { path: ['deleteAll'], args: [] },
        ], { role: 'admin' });

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('access denied');
    });

    test('permissions with undefined value block all roles', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        class Target {
            permissions = { deleteAll: undefined };
            deleteAll() { return 'deleted'; }
        }
        const receiver = new RpcAbleReceiver({ target: new Target() });
        const [result] = await receiver.dispatch([
            { path: ['deleteAll'], args: [] },
        ], { role: 'admin' });

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('access denied');
    });

    test('--request triggers request/response round-trip', async () => {
        const responses = [];
        class Target {
            client = { '--response': (p) => responses.push(p) };
            async getGames() { return [1, 2]; }
        }
        await new RpcAbleReceiver({ target: new Target() }).dispatch([{
            path: ['--request'],
            args: [{ id: 'r1', path: ['getGames'], args: [] }],
        }]);
        expect(responses[0]).toMatchObject({ id: 'r1', ok: true, result: [1, 2] });
    });

    test('--request sends error response on exception', async () => {
        const responses = [];
        class Target {
            client = { '--response': (p) => responses.push(p) };
            async fail() { throw new Error('boom'); }
        }
        await new RpcAbleReceiver({ target: new Target() }).dispatch([{
            path: ['--request'],
            args: [{ id: 'r2', path: ['fail'], args: [] }],
        }]);
        expect(responses[0]).toMatchObject({ id: 'r2', ok: false });
        expect(responses[0].error.message).toBe('boom');
    });

    test('method named same as a receiver method resolves on target', async () => {
        class Target {
            dispatch() { return 'target dispatch'; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['dispatch'], args: [] },
        ]);
        expect(result).toBe('target dispatch');
    });
});

describe('RpcAbleReceiver contract validation', () => {
    function makeReceiver(contract, logMode = 'console.error') {
        class Target {
            greet(name) { return `hello ${name}`; }
            update(data) { return data; }
            anything(x) { return x; }
        }
        return new RpcAbleReceiver({
            target: new Target(),
            contract,
            validationFailed: logMode,
        });
    }

    test('valid input passes and method is called', async () => {
        const receiver = makeReceiver({
            greet: { inputSchema: { type: 'string', minLength: 1 } },
        });
        const [result] = await receiver.dispatch([{ path: ['greet'], args: ['world'] }]);
        expect(result).toBe('hello world');
    });

    test('wrong type blocks call and returns undefined', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        const receiver = makeReceiver({ greet: { inputSchema: { type: 'string' } } });
        const [result] = await receiver.dispatch([{ path: ['greet'], args: [42] }]);

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('validation failed');
    });

    test('missing required property blocks call', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        const receiver = makeReceiver({
            update: { inputSchema: { type: 'object', required: ['id'] } },
        });
        const [result] = await receiver.dispatch([{ path: ['update'], args: [{ name: 'x' }] }]);

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('missing required property');
    });

    test('method not listed in contract passes through', async () => {
        const receiver = makeReceiver({ greet: { inputSchema: { type: 'string' } } });
        const [result] = await receiver.dispatch([{ path: ['anything'], args: [99] }]);
        expect(result).toBe(99);
    });

    test('validationFailed: throw throws instead of returning undefined', async () => {
        const receiver = makeReceiver({ greet: { inputSchema: { type: 'string' } } }, 'throw');
        await expect(
            receiver.dispatch([{ path: ['greet'], args: [false] }])
        ).rejects.toThrow('validation failed');
    });

    test('validationFailed: false suppresses log and returns undefined', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a);

        const receiver = makeReceiver({ greet: { inputSchema: { type: 'string' } } }, false);
        const [result] = await receiver.dispatch([{ path: ['greet'], args: [123] }]);

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors).toHaveLength(0);
    });

    test('enum validation blocks value not in list', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        const receiver = makeReceiver({ greet: { inputSchema: { enum: ['alice', 'bob'] } } });
        const [result] = await receiver.dispatch([{ path: ['greet'], args: ['charlie'] }]);

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('must be one of');
    });

    test('array items validation blocks invalid item', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        const receiver = makeReceiver({
            update: { inputSchema: { type: 'array', items: { type: 'number' } } },
        });
        const [result] = await receiver.dispatch([{ path: ['update'], args: [[1, 'two', 3]] }]);

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('item[1]');
    });
});

describe('RpcAbleReceiver dispatch with role', () => {
    test('role is appended as the last argument', async () => {
        class Target {
            doSomething(data, role) { return { data, role }; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch(
            [{ path: ['doSomething'], args: [{ x: 1 }] }],
            { role: 'admin' }
        );
        expect(result).toEqual({ data: { x: 1 }, role: 'admin' });
    });

    test('works with namespace path', async () => {
        class Target {
            scenes = {
                delete: async ({ sceneId }, role) => ({ deleted: sceneId, by: role }),
            };
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch(
            [{ path: ['scenes', 'delete'], args: [{ sceneId: 7 }] }],
            { role: 'admin' }
        );
        expect(result).toEqual({ deleted: 7, by: 'admin' });
    });

    test('permission allows matching role', async () => {
        class Target {
            permissions = { secret: ['admin'] };
            secret(role) { return `ok as ${role}`; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch(
            [{ path: ['secret'], args: [] }],
            { role: 'admin' }
        );
        expect(result).toBe('ok as admin');
    });

    test('permission blocks non-matching role', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        class Target {
            permissions = { secret: ['admin'] };
            secret() { return 'ok'; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch(
            [{ path: ['secret'], args: [] }],
            { role: 'guest' }
        );

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('access denied');
        expect(errors[0]).toContain('guest');
    });

    test('blocks methods not listed in permissions', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        let called = false;
        class Target {
            permissions = { safe: ['user'] };
            hidden() {
                called = true;
                return 'should-not-run';
            }
        }

        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch(
            [{ path: ['hidden'], args: [] }],
            { role: 'user' }
        );

        console.error = orig;
        expect(result).toBeUndefined();
        expect(called).toBe(false);
        expect(errors[0]).toContain('access denied');
    });

    test('receiver settings can silence notFound logs', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        const [result] = await new RpcAbleReceiver({ target: {}, notFound: false }).dispatch(
            [{ path: ['missing'], args: [] }],
            { role: 'user' }
        );

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors).toHaveLength(0);
    });

    test('receiver settings can route forbidden logs to console.log', async () => {
        const logs = [];
        const errors = [];
        const origLog = console.log;
        const origError = console.error;
        console.log = (...a) => logs.push(a.join(' '));
        console.error = (...a) => errors.push(a.join(' '));

        class Target {
            permissions = { secret: ['admin'] };
            secret() { return 'ok'; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target(), forbidden: 'console.log', permission: false, notFound: false }).dispatch([{ path: ['secret'], args: [] }], { role: 'user' });

        console.log = origLog;
        console.error = origError;
        expect(result).toBeUndefined();
        expect(logs[0]).toContain('access denied');
        expect(errors).toHaveLength(0);
    });

    test('receiver settings accept "error" alias for console.error', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        class Target {
            permissions = { secret: ['admin'] };
            secret() { return 'ok'; }
        }

        const [result] = await new RpcAbleReceiver({ target: new Target(), forbidden: 'error' }).dispatch(
            [{ path: ['secret'], args: [] }],
            { role: 'user' }
        );

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('access denied');
    });

    test('missing method returns undefined and logs error', async () => {
        const errors = [];
        const orig = console.error;
        console.error = (...a) => errors.push(a.join(' '));

        class Target {}
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch(
            [{ path: ['missing'], args: [] }],
            { role: 'admin' }
        );

        console.error = orig;
        expect(result).toBeUndefined();
        expect(errors[0]).toContain('missing');
    });

    test('multiple args are passed correctly before role', async () => {
        class Target {
            add(a, b, role) { return { sum: a + b, role }; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch(
            [{ path: ['add'], args: [3, 4] }],
            { role: 'user' }
        );
        expect(result).toEqual({ sum: 7, role: 'user' });
    });

    test('no role bypasses permission checks', async () => {
        class Target {
            permissions = { secret: ['admin'] };
            secret() { return 'ok'; }
        }
        const [result] = await new RpcAbleReceiver({ target: new Target() }).dispatch([
            { path: ['secret'], args: [] },
        ]);
        expect(result).toBe('ok');
    });
});

describe('encodeRpcMessage / decodeRpcMessage', () => {
    const batch = [{ path: ['foo'], args: [1] }];

    test('encode produces a JSON string with _rpcable envelope', () => {
        const parsed = JSON.parse(encodeRpcMessage('ch', batch));
        expect(parsed._rpcable).toBe(1);
        expect(parsed.event).toBe('ch');
        expect(parsed.batch).toEqual(batch);
    });

    test('decode returns batch from envelope', () => {
        expect(decodeRpcMessage(encodeRpcMessage('ch', batch), 'ch')).toEqual(batch);
    });

    test('decode filters out wrong event', () => {
        expect(decodeRpcMessage(encodeRpcMessage('ch', batch), 'other')).toBeNull();
    });

    test('decode accepts raw array (socket.io legacy format)', () => {
        expect(decodeRpcMessage(batch)).toEqual(batch);
    });

    test('decode returns null for garbage', () => {
        expect(decodeRpcMessage('not json')).toBeNull();
        expect(decodeRpcMessage(null)).toBeNull();
        expect(decodeRpcMessage('{}')).toBeNull();
    });

    test('decode handles Buffer input', () => {
        const buf = Buffer.from(encodeRpcMessage('ch', batch), 'utf8');
        expect(decodeRpcMessage(buf, 'ch')).toEqual(batch);
    });
});
