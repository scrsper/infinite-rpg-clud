# Web client — performance results

Measured 2026-09-29 on the target machine: **AMD Radeon RX 6650 XT (RDNA 2) + Ryzen 5 9600X, Windows 11,
Chrome 154 headed, 144 Hz display**, against the **production bundle** served by the loopback gateway (the
path *Play Torn Veil Web* uses) and the isolated preview world (`web-preview`, dev environment, 9 resident
regions). Frame time is the page's own frame-to-frame interval (`requestAnimationFrame` deltas over the
render loop). Raw results: `evidence/perf/*.json`. Harness: `scripts/web/perf.ts` (`npm run web:perf`).

Mandate targets: **median ≤ 16.7 ms, p95 ≤ 25 ms, p99 ≤ 50 ms.**

## What each run does

Ordinary trusted keyboard and mouse input, no debug teleporting: 6 s idle → 14 s walk → 20 s sprint with
constant camera turning → 8 rounds of strike, guard and dodge (about 48 s, ~6 700 frames at 144 Hz). One
run per configuration, so single-run outliers are visible rather than averaged away.

## Result: all three targets met in every configuration

Display refresh cap **on** (what a player sees; 6.9 ms is one 144 Hz frame, so the median tells you the
game keeps up with the display, not how much headroom it has):

| Renderer | Size | Tier (auto) | Median | p95 | p99 | Worst frame | Frames > 50 ms |
|---|---|---|---|---|---|---|---|
| WebGPU | 1280×720 | balanced | 7.0 ms | 10.3 ms | 14.8 ms | 36 ms | 0 |
| WebGPU | 1920×1080 | balanced | 6.9 ms | 8.1 ms | 10.4 ms | 118 ms | 1 |
| WebGPU | 2560×1440 | balanced | 7.0 ms | 8.3 ms | 12.0 ms | 21 ms | 0 |
| WebGL 2 | 1280×720 | low (0.85×) | 6.9 ms | 7.0 ms | 7.1 ms | 11 ms | 0 |
| WebGL 2 | 1920×1080 | low (0.85×) | 6.9 ms | 7.8 ms | 8.3 ms | 10 ms | 0 |
| WebGL 2 | 2560×1440 | low (0.85×) | 7.0 ms | 8.2 ms | 9.4 ms | 12 ms | 0 |

Frame-rate cap **lifted** (`--disable-frame-rate-limit --disable-gpu-vsync`), which shows the real cost per frame:

| Renderer | Size | Median | p95 | p99 | Worst frame | Frames > 50 ms | ≈ fps at median |
|---|---|---|---|---|---|---|---|
| WebGPU | 1280×720 | 4.4 ms | 6.6 ms | 8.6 ms | 23 ms | 0 | 227 |
| WebGPU | 1920×1080 | 4.3 ms | 6.4 ms | 8.5 ms | 12 ms | 0 | 233 |
| WebGPU | 2560×1440 | 4.3 ms | 7.3 ms | 10.2 ms | 28 ms | 0 | 233 |
| WebGL 2 | 1280×720 | 5.0 ms | 6.5 ms | 7.9 ms | 74 ms | 1 | 200 |
| WebGL 2 | 1920×1080 | 6.6 ms | 8.2 ms | 9.6 ms | 131 ms | 2 | 152 |
| WebGL 2 | 2560×1440 | 8.5 ms | 10.5 ms | 13.0 ms | 100 ms | 2 | 118 |

With a crowd (the village square, 4–8 people in view, WebGPU 1080p, cap lifted, shortened run):
median 5.7 ms, p95 8.9 ms, p99 11.4 ms, worst 31.5 ms, no frame over 50 ms (`evidence/perf/village-*.json`).

WebGL 2 is genuinely tested: the same scene, driven through the same journey, with the reduced-effects tier
(no bloom, no MSAA, no grass tufts, shorter distance; resolution scale 0.85). It is slower than WebGPU
here because it draws through ANGLE/D3D11, not because it does less.

## What the numbers do not say

- They are one machine, one browser, one display refresh. They say nothing about weaker GPUs, laptops on
  battery, integrated graphics, or other browsers. The auto quality governor (below) exists for those cases
  but was only exercised by CPU throttling, not on real weak hardware.
- They are in-page frame intervals, not present-to-photon latency and not a frame capture (no PresentMon).
- Isolated single frames of 60–130 ms still occur in some runs (first use of a shader variant, a large region
  landing, GC). They are rare (0–2 frames in ~7 000) and the p99 stays under 15 ms, but a player can feel one.
  Whether that matters is a human judgement (`HUMAN_TEST_GUIDE.md`).

## Region streaming: how hitches were found and reduced

Early runs (before this work's streaming changes) had 400–740 ms stalls each time a settlement's region
arrived while walking, and over 10 frames longer than 50 ms per run. The cause was measured, not guessed
(`src/web/game/probe.ts` records slow work with labels; Chrome long-animation-frame entries say whether time
went to script, render or waiting):

| Cause | Fix | Effect |
|---|---|---|
| One region built synchronously in a single frame (structures alone ~230 ms) | Region build is a generator of stages run inside a per-frame budget (6 ms in play, 40 ms behind the loading screen); structures and vegetation yield every ~3 ms | Script cost per frame stays under the budget; the earlier worst case of 100–230 ms per step is gone from the slow-work log |
| Number of lights on every lit material changed as torches and windows entered range → a new shader (WebGPU: pipeline) per count | The light pool keeps every light enabled and parks idle ones at zero intensity, so the shader never changes | Removed the recurring 300–450 ms stalls while walking |
| First person, animal or strike on screen compiled its shaders mid-play | A warm-up behind the loading screen draws one of each kind of person and animal and a spark burst, then discards them | First NPC no longer stalls a frame |
| Materials orphaned per person and shared textures disposed with the first person to leave (garments vanished on later people) | Orphaned kit materials disposed; shared textures never disposed with a person | Fixed a resource growth and a visible defect (see `KNOWN_DEFECTS.md`) |

A 45-minute soak before those fixes had 1 window with a 408 ms frame (entering a settlement) and no other frame
over 60 ms; the final-build soak is reported below.

## Long session (soak)

Two automated ordinary-input sessions in real Chrome (labelled automated, not human). Sampling every 30 s:
JS heap, scene objects (meshes, materials, textures), resident regions, frame-time tail, prediction corrections,
latency, console errors.

| | 45 min, before the leak and streaming fixes | 40 min, later build (before the cloth-print cache bound) |
|---|---|---|
| Duration / distance | 45.1 min, roughly 7 km of travel | 40.1 min; 59 travel legs between settlements, 1 conversation |
| Heap (JS) | 151–322 MB, no upward trend | 255–610 MB (one 610 MB spike, otherwise 255–500 MB) with a **slow upward drift** |
| Resident regions | 6–9 | 6–9 |
| Materials / textures | materials 38–164 (they follow how many people are in view); textures flat at 77 | materials 38–164 (same); **textures rose steadily 180 → 729** |
| Frame time | median 6.9 ms; worst window p99 20.8 ms; one 408 ms frame | median of medians 7.0 ms; worst window p99 18.4 ms; worst frame 87 ms |
| Prediction corrections | 0 snapped, largest smoothed correction 7 cm; RTT 0.4–25 ms | 0 snapped, largest smoothed correction 0.03 mm; RTT up to 126 ms (a single spike) |
| Disconnects / errors | none / 1 unhandled pointer-lock refusal (fixed) | none / 0 |

**The second soak found a real leak, and it is not re-verified.** Cloth prints (a 256² canvas texture per person's
garment colours) were cached forever by key, so texture count grew about 14 per minute of walking through settlements
and the heap drifted upward. After the run I bounded the cache (reference-counted; only the 40 most recently used idle
prints are kept, `src/web/actors/characterMaterials.ts`). That fix compiles and the affected screens render, but **no
new long soak has confirmed that textures and heap now stay flat**. Treat memory stability over an hour as unproven
until it is re-run (`npm run web:journey`).

## Quality governor (automatic tier)

With quality on *auto*, the client starts at "balanced" (WebGPU) or "low" (WebGL 2) and only ever steps **down**
(three slow windows of median > 22 ms or p95 > 48 ms → next cheaper tier, then render scale 0.85/0.72/0.6),
with a toast that says so. It never steps up by itself (a capped display cannot tell "fast" from "capped").
Verified by unit tests (`tests/web-governor.test.ts`, 6) and once live: with CPU throttled 8× (Chrome DevTools
protocol) the tier went **balanced → low** by itself (`evidence/perf/webgpu-1920x1080-throttle8.json`); the
frame time under that throttle (median 115 ms) is a synthetic stress, not a target.

## Reproduce

```
npm run web:build
npx tsx scripts/web/perf.ts --renderer webgpu --size 1920x1080 [--uncapped] [--seconds 1] [--throttle 8] [--name "New Person"]
node scripts/web/perf-table.mjs .debug/web/perf
```

It needs the preview gateway running (`Play Torn Veil Web.cmd -NoBrowser` starts or reuses it) and drives the
account's last character; `--name` begins a new one at the spawn point instead.
