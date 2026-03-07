---
name: rpcable-expert
description: Expert workflow for implementing, debugging, and refactoring projects that use rpcable. Use this skill whenever the user mentions RpcAble, RpcAbleReceiver, socket.io RPC, native WebSocket RPC, HTTP RPC, Bun.serve, Express adapters, UserSession architecture, collector/pending push queues, role permissions, contract/inputSchema validation, PHP adapter parity, or transport parity. Trigger even when the user asks generic things like "sistema la sessione", "fai parity http/ws", or "migliora DX" in a codebase that contains rpcable patterns.
---

# RpcAble Expert

Use this skill to keep rpcable implementations coherent, elegant, and transport-agnostic.

## Core principles

1. Keep business logic transport-transparent.
   - Put domain logic in one `UserSession` class.
   - Avoid splitting business logic into `UserSessionWs` and `UserSessionHttp`.
   - Wire transport in adapters, not in domain methods.

2. Prefer one public outbound API.
   - Use `RpcAble` for `socketio`, `websocket`, `http`, and `collector`.
   - Use `RpcAbleReceiver` for inbound dispatch.

3. Preserve parity between transports.
   - WS: push with `this.client.someEvent(...)`.
   - HTTP: return `{ results, push }` and auto-apply `push` client-side.
   - For offline/pending HTTP push, keep a server-side session store and flush on next request.

4. Keep DX high and predictable.
   - No string dispatch or switch routers.
   - No placeholder stubs that hide missing handlers.
   - Lean on batching and namespaces already provided by rpcable.
   - Register client push handlers with `userSession.extend(...)`.
   - Keep receiver-side validation in `contract` so transport behavior stays aligned.

## Execution workflow

When asked to implement or fix rpcable code, follow this sequence.

1. Inspect current architecture.
   - Locate `RpcAble`/`RpcAbleReceiver` usage.
   - Locate transport-specific wiring points.
   - Locate `UserSession` and permission model.

2. Normalize architecture if needed.
   - Extract shared business logic into one `UserSession`.
   - Keep adapters thin (`ws-socketio`, `http-bun`, `http-express`).

3. Apply transport-correct semantics.
   - `socketio` / `websocket`: default fire-and-forget, use `.request()` when a return value is required.
   - `http`: direct await, with optional `.request()`/`.expects()` alias behavior.
   - `collector`: server-side push queue + `flush()`.

4. Keep auth and role in adapter layer.
   - Compute `userData` and `role` from request/socket context.
   - Call `receiver.dispatch(batch, { role })`.
   - If `permissions` exists and a role is provided, treat it as a whitelist:
     - method not listed => denied (`permission`)
     - method listed but role missing => denied (`forbidden`)
     - method listed with falsy/non-array value (`false`, `undefined`, `[]`) => denied for everyone

5. Keep validation parity where contracts exist.
   - Prefer `new RpcAbleReceiver({ target, contract, validationFailed })`.
   - `contract` keys are dot-joined method paths like `profile.save`.
   - Validate only `args[0]`; leave later args untouched.
   - `validationFailed: 'throw'` is the right default for `.request()` / HTTP flows when the caller needs an explicit error.
   - If you update validation in JS, check PHP adapter parity too.

6. Verify end-to-end behavior.
   - Batching in same tick.
   - Namespace paths and `.set` behavior.
   - Permissions enforced.
   - Contract validation enforced.
   - HTTP push delivered and pending queue flushed correctly.

7. Update docs/templates with code changes.
   - Keep examples in sync with API and architecture.
   - Keep `README.md`, `examples/`, and PHP adapter examples aligned with runtime behavior.

## Canonical patterns

### Client (socket.io)

```js
import { RpcAble, RpcAbleReceiver } from 'rpcable';

const session = {};
const userSession = new RpcAble({
    transport: 'socketio',
    socket,
    channel: '-userSession',
    target: session,
});

const receiver = new RpcAbleReceiver({ target: session });
socket.on('-userSession', (batch) => receiver.dispatch(batch));
```

### Client (HTTP)

```js
import { RpcAble } from 'rpcable';

const session = {};

const userSession = new RpcAble({
    transport: 'http',
    endpoint: '/rpc/user-session',
    target: session,
});

userSession.extend({
    gamesReceived(games) {
        // push from HTTP response
    },
});
```

### Server adapter (Bun or Express)

```js
const session = getOrCreateSession(sessionKey);
const results = await session.receiver.dispatch(batch, { role });
return { results, push: session.client.flush() };
```

### Business session (shared)

```ts
import { RpcAble, RpcAbleReceiver } from 'rpcable';

class UserSession {
    client = new RpcAble({ transport: 'collector' });
    receiver = new RpcAbleReceiver({ target: this });

    async getGames() {
        const games = await db.find('games', {});
        this.client.gamesReceived(games);
        return games.length;
    }
}
```

### Receiver log settings

```js
const receiver = new RpcAbleReceiver({
    target,
    notFound: 'console.error',
    permission: false,
    forbidden: 'console.log',
    validationFailed: 'console.warn',
});

// equivalent shape
receiver.setSettings({
    notFound: 'error',
    permission: false,
    forbidden: 'console.error',
    validationFailed: 'throw',
});
```

Accepted values: `false`, `undefined`, `'console.log'`, `'console.warn'`, `'console.error'`, `'error'`, `'throw'`.

### Contract validation

```js
const contract = {
    'saveProfile': {
        inputSchema: {
            type: 'object',
            required: ['displayName', 'favoriteNumber'],
            additionalProperties: false,
            properties: {
                displayName: { type: 'string', minLength: 3, maxLength: 20 },
                favoriteNumber: { type: 'integer', minimum: 1, maximum: 99 },
            },
        },
    },
    'profile.save': {
        inputSchema: {
            type: 'object',
            required: ['name'],
            properties: {
                name: { type: 'string', minLength: 1 },
            },
            additionalProperties: false,
        },
    },
};

const receiver = new RpcAbleReceiver({
    target,
    contract,
    validationFailed: 'throw',
});
```

Supported schema features currently include:

- boolean schemas `true` / `false`
- `enum`
- `type` as a string or array
- `minLength`, `maxLength`
- `minimum`, `maximum`
- `required`, `properties`, `additionalProperties: false`
- `items`

Behavior rules:

- validation applies only to the first argument (`args[0]`)
- methods not listed in `contract` are not validated
- `'throw'` makes request/response transports reject with a normal RPC error
- non-throw modes log and skip the method call

### PHP adapter parity

When working on `templates/adapters/RpcAble.php` or synced PHP examples, keep parity with JS receiver behavior:

- `contract` and `validationFailed` must be supported in PHP too
- PHP receiver log modes should match JS (`console.warn`, `throw` included)
- PHP validation errors should follow the same message shape: `[RpcAble] validation failed for "path": ...`
- if template PHP changes, sync any copied example adapter files

## Design rules for edits

- Prefer composition and small adapters over inheritance-heavy trees.
- Keep naming explicit: `transport`, `channel`, `endpoint`, `flush`, `dispatch`, `contract`.
- Keep error messages actionable and specific.
- Make TypeScript definitions match runtime behavior exactly.
- Keep tests behavior-oriented, not implementation-coupled.

## Anti-patterns to block

Do not introduce these patterns:

1. String-based rpc routers.
2. `switch(method)` dispatch blocks.
3. Raw app payloads through manual `socket.emit('foo', ...)` bypassing rpcable path/args.
4. Transport-specific business classes duplicating logic.
5. HTTP handlers that ignore queued push data.
6. Role checks scattered in controllers instead of `permissions` + receiver flow.
7. Validation rules hidden inside transport adapters when they belong in receiver `contract`.
8. Using removed APIs like `receive()`, `receiveAsync()`, or nested `{ log: { ... } }` receiver settings.

## Debug playbook

When behavior is wrong:

1. Confirm input is a batch array with `{ path, args }` entries.
2. Confirm adapter is using correct `transport` and required fields (`socket` or `endpoint`).
3. Confirm receiver is called with `{ role }` when permissions are expected.
4. Confirm `permissions` whitelist includes intended methods for that role.
5. Confirm target actually contains the method path.
6. If validation is involved, confirm the `contract` key matches the dot-joined method path and that only `args[0]` is being checked.
7. If `.request()` is failing silently, check whether `validationFailed` should be `'throw'`.
8. For HTTP parity issues, inspect response shape and whether `push` is processed.
9. For pending issues, inspect session key strategy (`sessionId/token` preferred over plain `userId`).
10. Tune receiver logs (`notFound` / `permission` / `forbidden` / `validationFailed`) when debugging noisy adapters.

## Output style when using this skill

When you answer the user after code changes:

1. Start with what changed and why in architecture terms.
2. List touched files.
3. Report verification steps run (tests/build).
4. Mention natural next steps only if useful.

Keep tone practical and avoid unnecessary theory unless requested.
