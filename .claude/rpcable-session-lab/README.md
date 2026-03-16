# RpcAble Session Lab

This workspace is for transport-level reproductions of rpcable session bugs.

Use it when a real flow is failing for one user, one session id, or one transport and you need logs that separate:
- outbound rpc batches
- server responses
- push payloads
- local push handler execution

## Install

```bash
npm install
```

Run that command inside `.claude/rpcable-session-lab/`.

## Starting Points

- `scenarios/http-example.mjs`
- `scenarios/socketio-example.mjs`
- `scenarios/websocket-example.mjs`

Copy the closest file to `scenarios/<bug-slug>.mjs` and adapt only the transport inputs, method calls, and handler names you need.

## Logs

Each run writes JSONL logs under `logs/<timestamp>-<label>/events.jsonl`.

## Notes

- The lab tries to load rpcable from the current repo when this repo itself is `rpcable`.
- In a consuming project, it falls back to the installed `rpcable` package.
- Keep tokens and secrets in environment variables, not tracked files.
