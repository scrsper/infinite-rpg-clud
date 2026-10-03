# Switching clients and rolling back

The web client is **another window onto the same world**, not another world. Switching between it and
the Unreal client never changes, migrates or rolls back world history. There is nothing to "convert".

## Two launchers, side by side

| Client | Launcher | What it needs |
|---|---|---|
| Unreal (unchanged) | `Play Torn Veil.cmd` → prepared human-acceptance kit (`docs/RUNNING_THE_GAME.md`) | packaged client + its staging world |
| Web (new) | `Play Torn Veil Web.cmd` (or `npm run web:play`) | built `dist-web`, a loopback world that opted into the web gateway |

`Play Torn Veil Web.cmd` runs a **read-only preflight** and stops on any problem; add `-CheckOnly` to
run only the checks. It checks Node and tsx, the built client and its character models, the profile
(`-Profile <name>`, default `web-preview`; the server must be loopback), that the world's `/health`
is `ready`, and that the world's config has `"webGateway": true`. Then it starts or reuses the gateway
on `127.0.0.1:7470`, mints a single-use launch link and opens your default browser (a WebGPU-capable
Chrome or Edge is recommended).

It never starts, stops, restarts, updates, resets, backs up or edits a world service, so it cannot
silently create a fresh world in place of the one you asked for. If the world is not running, it
says so; start that world with its own operator command.

## Choosing the world

Selection is by **profile**: `%LOCALAPPDATA%\TornVeil\Client\<name>.json` (`server: host:port`,
`account`, `token`). The default `web-preview` profile points at the isolated preview world (dev
environment, port 7460, `TORN_VEIL_ALPHA_HOME=…\TornVeilAlpha\web-preview`). To play another world, give
it a profile and (once, as an operator decision) enable the gateway on that world's config:

```
Play Torn Veil Web.cmd -Profile <name> [-Port <gatewayPort>]
```

Live (7400) and staging (7410) were **not** enabled for the web client by this work and were not
touched. The launcher refuses a world that lacks `webGateway`, and refuses non-loopback profiles.

## Going back to Unreal

Close the browser tab (the character then lingers per the server's normal disconnect grace) and
launch the Unreal client with its own launcher. Both clients use the same account and character; if one
is still connected, the other **takes over** with the server's normal rule — the older client shows
"Signed in elsewhere" and only reconnects if you choose. Do not run both against the same account at
once unless you mean to hand over control.

## Removing the web client entirely

Nothing outside `src/web`, `web/`, `src/webgate`, `scripts/web`, `docs/web`, `tests/web-*`, `art/tools/web_characters`,
`art/reference/web-rebirth`, the two launcher files and the `web:*` npm scripts belongs to it. The
server-side pieces are additive and default-off:

- `webGateway` config flag (false unless an environment opts in),
- client kind `web` in the admission allowlist,
- the optional `structures` projection, sent only to `web` clients.

Reverting the branch (`git revert` the range, or simply not merging it) restores the previous
behaviour byte-for-byte; a world that never had `webGateway` needs no change at all. Stopping the
gateway is closing its process (pid in `%USERPROFILE%\TornVeilAlpha\web-gateway\gateway.json`); the
world service is unaffected either way.

## If something goes wrong

| Symptom | Meaning / action |
|---|---|
| Launcher: "No world service is answering" | That world is not running. Start it with its operator command; the launcher will not. |
| Launcher: "does not admit the web gateway" | The world's config lacks `webGateway`. Decide whether to enable it for that world; it is off by default. |
| Page: "No game session" | The launch link was used or expired. Run the launcher again for a new link. |
| Page: "Signed in elsewhere" | Another client for the account took over. Choose "Take the game back here" or leave it. |
| Blank/black canvas | Try `?renderer=webgl2`; check the browser supports WebGPU or WebGL 2. |
| Models missing | `npm run web:assets` then `npm run web:build`. |
