# Change-lane register

Every change on `claude/web-rebirth` (from `c8eaba2`), by lane. Lane A = faithful client over existing
mechanics; Lane B = new mechanics behind an explicit persisted capability (none exist); Lane C =
unrelated simulation redesign (forbidden; none made).

**`src/sim` (the canonical simulation) has zero changes.** `git diff c8eaba2..HEAD -- src/sim` is empty.
No save schema, generator, RNG, world content, protocol number or spec revision changed.

## Lane A — additive server/bridge pieces (default-off, opt-in)

| File | Change | Effect on existing worlds/clients |
|---|---|---|
| `src/server/protocol.ts` | `CLIENT_KINDS` gains `web` | none: unknown/unlisted kinds behave as before |
| `src/server/config.ts` | `webGateway: boolean`, default `false` | none unless a world's config sets it |
| `src/server/live.ts` | admit `web` only if `webGateway` **and** loopback; pass `structures` option to the regional transport for `web` only | none for `unreal`/`probe`; refusal for `web` when off (tested) |
| `src/server/ops.ts` | `--web-gateway` flag writes that config boolean | none unless used |
| `src/bridge/regions.ts` | optional `STRUCTURAL` run-length `structures` projection built from the real voxel grid | native projection byte-identical (tested: `web-structures.test.ts`) |
| `src/bridge/streaming.ts` | plumb the option through | none |
| `src/webgate/gateway.ts`, `main.ts` | new loopback browser gateway | new process; not part of the server |

## Lane A — client, tooling, launcher, docs (new files)

| Path | What |
|---|---|
| `src/web/**`, `web/**`, `vite.web.config.ts` | the Babylon.js client and its bundle config |
| `art/tools/web_characters/**`, `art/reference/web-rebirth/**` | Blender generators, the two concept sheets |
| `scripts/web/**` | launcher (`Play-Web.ps1`), evidence harnesses (`drive`, `shoot`, `perf`, `journey`, `contact-sheet`, `capture-stream`), `build-assets.mjs` |
| `Play Torn Veil Web.cmd` | the web launcher (the Unreal `Play Torn Veil.cmd` is untouched) |
| `tests/web-*.test.ts` | gateway, structures and browser-boundary tests |
| `docs/web/**` | this documentation set |
| `package.json` / `package-lock.json` | `@babylonjs/core` + `@babylonjs/loaders` 9.28.0 (pinned), `playwright` (dev), `web:*` scripts |
| `.gitignore`, `.claude/launch.json` | ignore `dist-web` and generated GLBs; dev-server entries |

## Lane A — behaviour the client adds on top of the same rules

| Area | Client-side only, never authority |
|---|---|
| Movement | Shared pure prediction kernel (`predictMovement`, `windowQuery`) replays unacknowledged `move` commands; corrections are smoothed and snap only beyond 1.5 m; the server remains the authority |
| Combat | Anticipation animation starts on input and is cancelled by a `rejected`/`cancelled` receipt; the anticipated motion is bound to its command id and the server's confirmation does not restart it; hit feedback (camera kick, rumble, sound, hit reaction) fires only from the server's own hit event, and no particle, trail or decal is drawn |
| Camera | Third-person rig with obstruction handling; cosmetic only |
| Presentation | Floating origin, region streaming/LOD, vegetation and grass, lighting, audio |
| Appearance | Canonical appearance tokens realised deterministically on shared kits; cosmetic only |

## Lane B — none

See `EXTENSIONS.md`. No capability flag, no new action, no protocol revision.

## Lane C — none

No simulation, economy, ecology, social, save or generator change was made or needed.

## How to re-verify this register

```
git diff --stat c8eaba2..HEAD -- src/sim src/persist        # must be empty
git diff c8eaba2..HEAD -- src/server src/bridge              # the additive pieces above only
```
