---
name: rpcable-session-lab
description: Focused workflow for reproducing concrete rpcable session/runtime bugs with a disposable Node lab under .claude/rpcable-session-lab. Use this in projects that use rpcable when a specific user, session, or transport is misbehaving and the fastest path is to spin up a scripted client, replay the same RPC calls, and inspect outbound batches, responses, push events, headers, or raw socket traffic. Examples: "Carmelo does not receive chat messages", "latest posts never arrive", "HTTP push is empty", "socket.io join works but follow-up events disappear". Do not use this for generic refactors or architecture work; use rpcable-expert for those.
license: MIT
metadata:
  author: card-room
  tags: rpcable, session, debugging, node, socket.io, websocket, http, logs
---

# RpcAble Session Lab

Use this skill to reproduce a real rpcable session bug from the outside before changing app code.

## When To Apply

Apply when all of these are true:
- the project already uses `rpcable`
- the user reports a concrete runtime symptom, not a vague code smell
- a scripted Node client can clarify whether the problem is send, response, push, auth, session key, or local dispatch

Typical triggers:
- one user or session is not receiving chat messages
- latest posts, timeline items, or notifications never arrive
- HTTP returns `results` but push does not trigger locally
- WebSocket or socket.io joins correctly but follow-up events disappear
- a specific role, token, header, or session id behaves differently from another

Do not use this skill for:
- generic refactors
- API design or transport architecture discussions
- broad rpcable feature work with no reproduction target

For those cases, load `rpcable-expert` instead.

## Lab Location

Reuse the shared lab at:
- `.claude/rpcable-session-lab/`

Important files:
- `.claude/rpcable-session-lab/package.json`
- `.claude/rpcable-session-lab/lib/loadRpcable.mjs`
- `.claude/rpcable-session-lab/lib/httpSession.mjs`
- `.claude/rpcable-session-lab/lib/socketioSession.mjs`
- `.claude/rpcable-session-lab/lib/websocketSession.mjs`
- `.claude/rpcable-session-lab/scenarios/`
- `.claude/rpcable-session-lab/logs/`

Keep scenario-specific scripts in `scenarios/`. Keep runtime artifacts in `logs/` or `scratch/`, not scattered across the repo.

## Workflow

1. Capture the symptom precisely.
   - Identify the transport: `http`, `socketio`, or `websocket`.
   - Identify the real method path(s), channel, endpoint, headers, auth, session id, and expected push method names.
   - Prefer one failing user or session, for example `Carmelo`, over vague averages.

2. Recreate the smallest useful client.
   - Start from the closest example in `.claude/rpcable-session-lab/scenarios/`.
   - Create or update `scenarios/<bug-slug>.mjs`.
   - Use environment variables for secrets, ids, tokens, and URLs.
   - Do not hardcode credentials into tracked files.

3. Install lab dependencies only inside the lab.
   - Run `npm install` in `.claude/rpcable-session-lab/` when `node_modules/` is missing or stale.
   - Do not install ad hoc packages in the project root just for debugging.

4. Reproduce and log aggressively.
   - Log outbound rpc batches.
   - Log raw transport payloads when possible.
   - Log HTTP responses, including `results` and `push`.
   - Log local push handler invocations and return values.
   - Save logs under `.claude/rpcable-session-lab/logs/<timestamp>-<label>/`.

5. Correlate the lab run with repo code.
   - Compare the logged method paths with server-side receiver targets.
   - Check whether the bug is before dispatch, during dispatch, after dispatch, or only in the UI integration.
   - If a code fix is needed, switch into normal repo editing with `rpcable-expert` guidance.

## Transport Recipes

### HTTP

- Use `createHttpSession()` from `lib/httpSession.mjs`.
- Pass headers such as `x-session-id`, bearer tokens, or debug headers through the helper.
- Use `.request()` or `.expects()` when you need a returned value, for example `await userSession.join({ name: 'Carmelo' }).request()`.
- Register push handlers with `extend(userSession, { handlerName(...) {} })` — not `userSession.extend(...)`.
- Inspect whether the response contains the expected `push` array and whether local handlers ran.

### Socket.io

- Use `createSocketIoSession()` from `lib/socketioSession.mjs`.
- Provide `socketOptions` for `auth`, `query`, `extraHeaders`, or reconnection tweaks.
- Use `.request()` or `.expects()` when you need a return value.
- Compare emitted channel payloads with inbound channel payloads and dispatched push handlers.

### Native WebSocket

- Use `createWebSocketSession()` from `lib/websocketSession.mjs`.
- Pass headers or subprotocols if the app uses them.
- Watch raw websocket frames plus decoded rpc batches.
- Verify whether the problem is missing frames, wrong channel, decode failure, or receiver dispatch.

## Logging Rules

- Wrap local target handlers so every push callback is logged.
- Prefer JSON-safe logs; keep each run in its own directory.
- If the raw transport is suspicious, patch `fetch`, `socket.emit`, or `socket.send` inside the lab helper, not inside app code.
- Keep the reproduction minimal: one user, one failing flow, one transport at a time.

## Guardrails

- Do not change production code until the reproduction is clear.
- Do not call the bug reproduced unless the logs show the expected failing path.
- Do not treat a UI symptom as a server bug until the Node lab proves where the message stops.
- Do not use this skill when the user is asking for a generic rpcable refactor.

## Output Style

When you answer after using this skill:

1. State the failing flow you reproduced.
2. Point to the scenario file and log directory.
3. Say whether the message was lost on send, response, push delivery, or local dispatch.
4. If a code fix is needed, say which repo files should change next.
