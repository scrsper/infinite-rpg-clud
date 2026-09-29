# Web gateway and admission

The authoritative server admits a client only with custom upgrade headers (`x-torn-veil-*`). A
browser page cannot set WebSocket headers, and that is the reason arbitrary web pages cannot drive a
character. The web client therefore does **not** weaken the server: it talks to a small loopback
gateway that holds the account credential server-side and opens the native-style upstream socket.

```
Browser page  ──ws://127.0.0.1:<gw>/ws──►  src/webgate (loopback)  ──ws + headers, kind "web"──►  world service (loopback)
   cookie session, allowlisted JSON only        credential lives here only                    unchanged rules, unchanged protocol
```

## What is where

| Piece | File | Change to existing code |
|---|---|---|
| Gateway | `src/webgate/gateway.ts`, `src/webgate/main.ts` | new |
| Client kind | `src/server/protocol.ts` (`CLIENT_KINDS.web`) | additive constant |
| Admission | `src/server/live.ts` | accepts `web` only when the environment config has `"webGateway": true` **and** the connection arrives from loopback |
| Config | `src/server/config.ts`, `src/server/ops.ts` (`--web-gateway`) | one boolean, default off |
| Region detail | `src/bridge/regions.ts`, `src/bridge/streaming.ts` | optional web-only `structures` run-length projection, asked for only by the `web` kind; the native projection is byte-for-byte unchanged (test) |

Legacy worlds, native clients and the Unreal launcher never see any of it: `webGateway` defaults to
false, so a world that has not opted in refuses `web` exactly like an unknown client kind.

## Session model

1. The launcher asks the running gateway (`POST /api/operator/launch`, header
   `x-torn-veil-gateway-operator`, secret held in `%USERPROFILE%\TornVeilAlpha\web-gateway\gateway.json`,
   never committed) for a **one-time launch link**. It expires in 2 minutes and is consumed on first use.
2. The browser follows `/launch/<nonce>`; the gateway sets `tvw_session` (HttpOnly, SameSite=Strict,
   Path=/, 12 h) and redirects to `/`.
3. The page opens `ws://127.0.0.1:<gw>/ws?character=…`. The gateway requires: an allowed `Host`
   (`127.0.0.1`, `localhost`, `[::1]` with its own port; otherwise 421), an **exact** `Origin`
   match (missing or foreign origin → 403; no wildcards), a live session cookie (else 401), and a
   valid character request (`auto`, `existing:<id>`, or `new` with name/sex).
4. It opens one upstream socket per browser socket with the native headers and client kind `web`.

The credential (account + token) is read from the client profile JSON
(`%LOCALAPPDATA%\TornVeil\Client\<profile>.json`) at gateway start. It is never in a URL, cookie,
page, bundle, log line, or any message to the browser.

## What the browser may say

Only these message types are forwarded; anything else is dropped and counted:
`command`, `presentation_ack`, `clock_probe`, `save`, `person_action`, `talk`, `dialogue_option`,
`dialogue_close`, `interact`, `container_transfer`, `hush`. `debug_inspect` and the legacy unbound
`move`/`attack` forms are deliberately absent. Binary frames are dropped. Frames over **4096 bytes**
close the socket (1009); more than 400 messages in a second closes it (1008); a browser that falls more
than 2 MiB behind is closed (1013). The client only ever sends **intentions**; it never steps the World.

## Network posture

- Binds loopback only (`127.0.0.1`, `::1`, `localhost`). Any other address throws at construction;
  the launcher never exposes anything on `0.0.0.0`.
- One configured upstream, plus an exact `host:port` allowlist; nothing else is ever connected to.
- The launcher refuses a profile whose server is not loopback.
- Static files are served from the built `dist-web` with a CSP (`default-src 'self'`,
  `script-src 'self' 'wasm-unsafe-eval'`, `connect-src` this gateway only, `frame-ancestors 'none'`),
  `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `COOP: same-origin`, and path traversal
  refused. There is no admin or debug route besides the operator launch mint.

## Takeover and ownership

The web client follows the same account-control rules as native: a second client for the same account
takes over and the previous one is closed with the server's own code (4000 "superseded"), which the
page shows as a "Signed in elsewhere" screen; it never reconnects on its own — the player chooses
"Take the game back here". The takeover parity is covered by a test
that runs a second browser through the gateway and compares to a second native client.

## Tests (all in `npm test`)

`tests/web-gateway.test.ts` (10): loopback-only + upstream allowlist; single-use launch link and cookie
flags; socket refused without session / with a foreign or missing origin / for another host; no admin
or debug route and no credential in any response; real admission to a character; forbidden message
types dropped (including `debug_inspect`); oversized and flooding browsers closed; server refusal codes
relayed; takeover parity; `web` refused when the environment has not enabled it.
`tests/web-structures.test.ts` (4): the native projection is unchanged and web detail is additive,
opt-in, exact (walls, door gaps, roofs from the real voxel grid) and bounded.
`tests/web-boundary.test.ts` (7): the browser bundle imports only browser-safe modules
(named allowlist of simulation kernels), no server/gateway/persistence/World-stepping code, no Node
built-ins, no credential access, and the mirrored protocol constants equal the server's.

## Not covered (be aware)

- Replay of an old launch link and cross-account leakage are tested only as far as the above
  (single-use nonce; one credential per gateway process). A separate hostile-client fuzz run has not
  been done.
- A gateway serves **one** account. Two players on one machine need two profiles and two gateways
  (`Play-Web.ps1 -Profile … -Port …`).
- Nonlocal (tailnet/LAN) browser access is not offered: it would need a secure transport this
  release does not provide.
