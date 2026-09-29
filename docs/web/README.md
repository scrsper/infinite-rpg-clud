# Torn Veil Web

A browser client (Babylon.js + TypeScript, WebGPU with a WebGL 2 fallback) for the same living world the
Unreal client plays. It is **another window onto the same simulation**: it sends intentions, draws what the
server projects, and never steps a world. The Unreal client and its launcher are untouched.

**Read first:** `KNOWN_DEFECTS.md` (what is missing or rough) and `PROGRESS.md` (verified / unverified /
partial / blocked, and where to resume). Nothing here has been played by a human.

## Run it

```
Play Torn Veil Web.cmd                 # preflight, gateway, single-use launch link, opens your browser
Play Torn Veil Web.cmd -CheckOnly      # run only the preflight; start nothing
Play Torn Veil Web.cmd -Profile <name> [-Port <gatewayPort>] [-Build]
```

The launcher never starts or changes a world: the world service must already be running and its config must
opt in with `"webGateway": true`. Default profile `web-preview` → the isolated preview world (port 7460).
Details, world selection and switching back to Unreal: `ROLLBACK.md`.

## Build it

```
npm install
npm run web:assets      # Blender headless → web/public/models/*.glb   (git-ignored; see WEB_ASSETS.md)
npm run web:build       # tsc + vite → dist-web/
npm run web:dev         # Vite dev server on 127.0.0.1:5180 (proxies /ws /api /launch to the gateway on 7470)
npm run web:gateway -- --profile <name> --port 7470 --static dist-web
```

Tests: `npx vitest run tests/web-*.test.ts` (gateway, structures, browser boundary, client logic, governor).

## Documents

| Doc | What it holds |
|---|---|
| `PROGRESS.md` | Outcome by area (VERIFIED / IMPLEMENTED BUT UNVERIFIED / PARTIAL / BLOCKED) and resume point |
| `KNOWN_DEFECTS.md` | Honest gaps and rough spots |
| `COVERAGE_LEDGER.md` | Every player-facing system: source → command → observation → UI → animation/audio → persistence → evidence |
| `EVIDENCE.md` | Baseline vs new, ordinary-input journey, scenario, gamepad (injected), UI legibility, screenshots |
| `PERFORMANCE.md` | Frame-time measurements by renderer and resolution, streaming analysis |
| `CONTROLS.md` | Player controls and settings |
| `HUMAN_TEST_GUIDE.md` | One-page guide; every verdict pending |
| `STYLE.md` | Art and audio direction from the two concept sheets |
| `WEB_ASSETS.md` | Source, licence audit, conversion manifest, hashes, rebuild |
| `WEB_GATEWAY.md` | Admission design, security posture, tests |
| `CHANGE_LANES.md` | Every change by lane (A faithful client / B extensions / C forbidden) |
| `EXTENSIONS.md` | Lane B status (not started) |
| `ROLLBACK.md` | Switching clients, choosing a world, removing the web client |
| `BASELINE.md` | The contract and environment at the start of this work |
| `evidence/` | Machine-readable results and selected screenshots referenced above |
