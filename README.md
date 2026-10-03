# Torn Veil Online

Torn Veil is a persistent simulated world. **Babylon.js is the active game client.**
`src/sim/` owns the world; `src/web/` displays it and requests canonical actions.
The simulation is being retained. Unreal is archived; Three.js is historical.
GitHub `main` remains the integrated baseline; this Babylon cleanup branch has not been merged into `main`.

Authoritative working checkout: `C:\Users\green\Desktop\projects\torn-veil-online`.

## Play

Double-click **Play Torn Veil.cmd** (or **Play Torn Veil Web.cmd**).
This opens Babylon using the isolated `web-quality` development world, separate
from live/staging. The launcher prepares/starts that preview when needed and
retains its existing save. **Play Torn Veil Isometric.cmd** offers the alternate view.

Use `Play Torn Veil Web.cmd -CheckOnly` for a read-only preflight.
[Browser controls](docs/web/CONTROLS.md) · [Browser setup](docs/web/README.md)

## Understand an NPC

Double-click **Torn Veil Observatory.cmd**. This opens a **separate disposable test
world**, not the world you are playing in Babylon. Closing its tab leaves its
server running; stopping the server loses its in-memory world and in-memory checkpoints.

For your first session, ignore the validation panels:

1. Select a person in the list or overhead map.
2. Read their current goal/action and hunger/thirst. A newly paused world may not have decisions yet.
3. Click **+1 hour**, wait for the advance to finish, and inspect the same person again.
4. Look at the recorded candidate reasons and history: what did they try, and what actually happened?
5. Compare **CANONICAL TRUTH** with **WHAT THIS PERSON BELIEVES**. Follow an event/source link if you want the supporting evidence.

An amber indicator means warnings or incomplete evidence; inspect the named finding.
A passing check is not a claim that the whole simulation is correct or fun.
[Full Observatory guide](docs/OBSERVATORY.md)

## Current direction

Finish a small, visually convincing Babylon experience and make its NPC behavior
understandable. Judge it in normal gameplay against the supplied visual references.
Do not restart the simulation or change engines to address an unmeasured problem.
Live inspection of the same world being played is still a gap; the Observatory
must not be described as that feature.

## Development

Use Node.js 22 and run `npm ci` in the checkout to install dependencies. These launchers
describe the prepared Windows development machine. A fresh clone does not include local
character GLBs or private profiles; see [asset setup](docs/web/WEB_ASSETS.md).
The Vite development client also needs the world service and web gateway described in
[browser setup](docs/web/README.md).

```powershell
npm run typecheck
npm run web:build
npm run web:dev
```

See [AGENTS.md](AGENTS.md), [.ai/REPO_MAP.md](.ai/REPO_MAP.md) and
[verification policy](.ai/TESTING.md). `npm run dev` and the default `build` scripts
still target the historical Three.js client; use `web:*` for Babylon.

[Unreal archive and recovery](docs/UNREAL_ARCHIVE.md) ·
[Visual reference assessment](docs/web/VISUAL_REFERENCE_GAP_V2.md)
