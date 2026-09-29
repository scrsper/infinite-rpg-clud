# Web client — outcome and resume point

Branch `claude/web-rebirth` (from `c8eaba2`), local commits only: **nothing pushed, nothing merged, no world or
live/staging state touched**. Written 2026-09-29. Outcomes use the mandate's four words, each with evidence.
The honest headline: **the client is playable end to end and the systems it exercises work, but it is not
"done" as the mandate defines it** — no human has played it, no physical controller has been used, the art is
prototype-level next to the two concept sheets, and Lane B was not started.

## VERIFIED (automated evidence, `EVIDENCE.md`)

- **Admission and isolation**: loopback gateway, one-time launch link → cookie, exact-origin/host allowlist,
  message allowlist and size/rate limits, expiry, cross-account refusal, takeover parity — 12 gateway tests.
  Browser bundle imports only browser-safe modules and mirrors the server's protocol constants — 7 tests.
- **Continuity with the native transport**: the same 18 scripted intents give identical admitted/rejected results and
  the identical final position through the native-style client and through the browser gateway; the native region
  projection is byte-identical; `src/sim` is untouched.
- **Play loop in a real browser (ordinary input)**: enter, walk with prediction (0 snapped corrections, RTT ~1–25 ms),
  walk up to a person, talk, read grouped options, trade with a confirmation, buy, eat, open Items/Abilities/Journal,
  save, reconnect and find the same person with the same purse and belongings.
- **Performance** on the RX 6650 XT: median ≤ 7 ms at 720p/1080p/1440p on WebGPU and WebGL 2 at the display's
  144 Hz cap, 4.3 ms median with the cap lifted, p99 ≤ 15 ms; region streaming time-sliced (`PERFORMANCE.md`).
  **Not verified:** long-session memory. A 40-minute soak found a texture/heap leak; it was fixed afterwards but not
  re-soaked.
- **Full test suite on the final commit** was not re-run (last full run: 1300/1301 mid-session; the 45 web tests and
  typecheck pass on recent commits).
- **Launcher**: read-only preflight with negative cases; never starts or changes a world.
- **Injected gamepad code path**: 17/17 (labelled injected, not physical).
- **UI legibility numbers** at 720p/1080p/1440p (nothing under 14.2 px, body 17 px).

## IMPLEMENTED BUT UNVERIFIED (exists, wired to the server projection, not driven end to end)

Crouch; open/close doors; rest/wake; reading records; container store/take; sell/give; theft prompt; paid hauling and
protection work; gathering and butchering; hush; meditate, training and breakthrough; ask/tell/teach/pay-debt
dialogue options; drinking; injury and recovery arc; death screen; multiplayer sightings; night and storm lighting
in play; audio quality; contact sparks on a real hit; the quality governor on real weak hardware; settings and
rebinding beyond what the scenario touched; reduced motion / large text / high contrast / colour assist.

## PARTIAL

- **Art**: prototype-level. Villagers read as varied people in the right clothes; faces, hands and hair are
  low-detail; wildlife is rounded but crude; the four concept creatures and the hero are recognisable, labelled
  previews, not finished assets; buildings have real geometry and roofs but repeating textures. See `STYLE.md`,
  `KNOWN_DEFECTS.md`.
- **Combat**: full input vocabulary reaches the server and animates from the action's own timing; not evaluated against
  real opponents (timed parry, multiple enemies, doorways, lock release).
- **First-hour experience**: contextual hints and a working talk/trade/eat loop; no fabricated tutorial and no
  measured first-hour usability.
- **Long ordinary session**: a 45-minute and a 40-minute automated soak for stability; neither is a play-through with
  work, training, danger and recovery.
- **Environment**: day, dusk, rain and night seen; storm, snow, and dawn/dusk transitions not systematically captured.
- **Audio**: synthesised, runs without error; not judged by ears.

## BLOCKED / NOT STARTED

- **Human playtest and physical-controller acceptance**: need a person and a device (`HUMAN_TEST_GUIDE.md`, all pending).
- **Lane B (vault/dive)**: not started by choice; a faithful client came first (`EXTENSIONS.md`).
- **Unreal retention checks**: not run (no Unreal session here). Only proven: no Unreal/`src/sim` file changed and the
  Unreal launcher is untouched.
- **Side-by-side with the native client**: not produced.

## Defects found by running it (and fixed)

Invisible garments on people after anyone left view (shared textures disposed with a person); material leak per
person; hitches from light-count shader churn and first-use shaders; carried items labelled "undefined"; trade rows
with stock notes skipping their confirmation; HUD labels under 12 px; grass blown out to white by day; pointer-lock
refusal surfacing as an error; a finished combat action making people hold a fighting stance (handled) and a lantern
carry pose reading as "hands up" (now one-handed).

## Resume here

1. Human pass: `HUMAN_TEST_GUIDE.md` — the only thing that can settle feel, clarity, art and enjoyment.
2. Art: heads/hands/hair, creature and hero previews, building textures and interiors, contact effects and weapon trails.
3. Drive the unverified systems above through the browser (hush, sparring, work, injury), then a real first-hour arc.
4. Lane B, only behind a persisted world capability in a forked preview world (`EXTENSIONS.md`).
5. When happy: push the branch and open a PR yourself (nothing here pushes or merges). Enabling the web gateway on
   any real world is an operator decision; this branch enables it only on the isolated preview world.

Commits: `git log --oneline c8eaba2..HEAD` (about 30). Isolated preview world: `%USERPROFILE%\TornVeilAlpha\web-preview`
(port 7460), gateway state `%USERPROFILE%\TornVeilAlpha\web-gateway` (port 7470); both can be deleted without effect on
anything else. The preview account holds three test characters.
