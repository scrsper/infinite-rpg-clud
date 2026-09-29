# Web rebirth — baseline manifest

Recorded 2026-09-29 before any web-rebirth change. Everything below was read from the live
checkout or measured on this machine; nothing is carried over from a conversation.

## Source

| | |
|---|---|
| Checkout | `C:\Users\green\Desktop\projects\torn-veil-online` (AGENTS.md §0 authoritative path) |
| Remote | `https://github.com/scrsper/torn-veil-online.git` |
| Starting branch / HEAD | `claude/inhabitable-alpha` @ `c8eaba2` (clean tree, pushed) |
| Work branch | `claude/web-rebirth`, created from that HEAD (no work was switched over) |
| Active agent sessions | none: 34 peer sessions, all offline or idle; Unreal Editor not running |

## Contracts the web client must speak (read from source)

| Contract | Value | Where |
|---|---|---|
| Alpha protocol | `1` | `src/server/protocol.ts` `ALPHA_PROTOCOL` |
| Region stream protocol | `2` | `src/bridge/streaming.ts` `REGION_PROTOCOL` |
| Interaction spec revision | `tv-interaction-6` | `src/sim/physical/interactionSpec.json` |
| Command envelope | version 2, epoch + controller + body bound, sequence, `commandId`, `specRevision` | `src/bridge/commands.ts` |
| Save schema | `25` | `src/sim/persist/save.ts` `SAVE_VERSION` |
| Generator | `playable-3` (fingerprint pinned; `playable-1/2` baselines preserved) | `src/server/fingerprint.ts` |
| Admission | custom upgrade headers `x-torn-veil-*`; client kind allowlist `unreal`, `probe` | `src/server/live.ts` `admit` |

The admission headers are the reason a browser cannot connect directly: a page cannot set them.
That is intended by the original design ("requiring them also keeps web pages from driving a
character"), so the web path is a loopback gateway (see `WEB_GATEWAY.md`), not a weakened server.

## Runtime and tooling

| | |
|---|---|
| Node / npm | v22.23.2 / 10.9.8 |
| TypeScript / Vite / Vitest | 5.6.x / 5.4.x / 4.1.x (from `package.json`) |
| Babylon.js | `@babylonjs/core` and `@babylonjs/loaders` **9.28.0**, pinned exact |
| Blender | 5.2.1 LTS (`C:\Program Files\Blender Foundation\Blender 5.2`), CLI usable headless |
| GPU / CPU / RAM | AMD Radeon RX 6650 XT (8 GB; WMI reports a capped 4 GB), Ryzen 5 9600X, ~31 GB |
| Unreal | 5.8 at `C:\Program Files\Epic Games\UE_5.8`; not launched for this work |

## Test evidence at baseline

- `npx tsc --noEmit -p .` passes (13.7 s).
- Full suite `npx vitest run`: 151 files, **1280/1280** passed at `9556da5` (HEAD `c8eaba2` only adds
  docs and native/probe C++ after that). Run in the previous session; not re-run for this record
  because nothing has changed since (AGENTS.md §14).
- Native `TornVeil.Presentation` 17/17 at `9a2aa61`.

## Environments (ports in use at start; none is touched by this work)

| Port | Environment | Owner |
|---|---|---|
| 7400 | live alpha.12 | protected |
| 7410 | staging 0.1.0-alpha.30 (preserved fork) | protected |
| 7430 | dev (`dev-inhabit`) | protected here: crowded with ~20 probe characters |
| 7440 / 7450 | `checkpoint-human` / `checkpoint-evidence` (Unreal human checkpoint 1) | protected |
| **7460** | **`web-preview` (new, this work): fresh isolated world, own state/credentials/backups** | this work |
| **7470** | web gateway (new): loopback only | this work |

## What is not verified by this record

No web client exists yet; the numbers above are the *starting* contract only. Asset licensing is
audited in `WEB_ASSETS.md`; art references in `STYLE.md`.
