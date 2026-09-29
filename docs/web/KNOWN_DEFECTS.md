# Known defects and gaps (web client)

Honest list as of the last commit on `claude/web-rebirth`. "Open" means not fixed; "Mitigated" means
reduced but present. Severity is my judgement, not a human's.

## Blocking a "done" claim

| # | Gap | Notes |
|---|---|---|
| D1 | **No human playtest, no physical controller test** | Verdicts are all pending (`HUMAN_TEST_GUIDE.md`). Gamepad code paths were exercised only by injection, if at all; nothing here certifies feel, clarity or enjoyment. |
| D2 | Player-facing systems are only partly exercised through the browser | `COVERAGE_LEDGER.md` marks each row; many item, trade, work, training and reconnect paths are implemented from the server's projections but were not driven end to end in a real browser session. |
| D3 | Combat verified against real targets only lightly | Input → server acceptance → anticipation/guard/dodge poses were seen; timed parry, multi-opponent, doorway and lock-release cases were not evaluated. |

## Art and presentation

| # | Gap | Severity |
|---|---|---|
| A1 | Faces/jaw and hands are low-detail; hair and hero tail volume read thin; hero is a showroom preview only | medium |
| A2 | Creature barrel shapes and boar colour are rough; concept previews (void stag, rift hawk, veil wraith, shattered colossus) are simple silhouettes, not finished creatures | medium |
| A3 | Buildings: real geometry and roofs, but repeating textures and plain interiors; no interior lighting art pass | medium |
| A4 | No weapon trails; contact feedback is a small spark burst plus camera kick/sound/rumble | low–medium (mandate asks for restrained trails) |
| A5 | Distant vista, clouds and water are plain; forest canopy is very dark at dusk | low |
| A6 | No quality governor: the tier is chosen once at start (WebGPU → balanced, WebGL2 → low) or by the setting; it does not adapt mid-session | low |
| A7 | Portrait is a live render-target readback each frame while a conversation is open (a few ms); framing differs slightly per body height | low |

## Behaviour

| # | Gap | Notes |
|---|---|---|
| B1 | Decorative trees, bushes and rocks are not collision | The simulation has no collision for client decoration, so the character can stand inside one (the client cannot add authority). The camera ignores plants while the player is inside one and is otherwise kept out of trunks, bushes and rocks. |
| B2 | `rejected:committed` receipts under rapid attack input | Expected server behaviour (an action is already committed); the client cancels the anticipated motion. The player sees a brief re-anticipation rather than a message. |
| B3 | The simulation keeps a *finished* combat action on a body, so its activity reads `combat` long afterwards | The client only treats a live action, a hit, or an attack/confront goal as a fighting stance. Upstream behaviour unchanged. |
| B4 | Streaming hitches: region builds are time-sliced (≤ 6 ms per frame in play), but a single step (terrain mesh upload, first-use shader) can still cost 60–120 ms, mostly at load and on entering a new settlement | Mitigated; see `PERFORMANCE.md`. Median frame time is display-refresh-bound (6.9 ms at 144 Hz). |
| B5 | Material/texture count rose while passing settlements in a long session | Cause found: the kit's per-instance material clones were orphaned when replaced by per-person materials. Fixed in code; a re-soak is needed to confirm (see `PERFORMANCE.md`). |
| B6 | The soak journey never reached a conversation | The scripted walker did not find people on its route; conversation, trade and menus were exercised separately (see `EVIDENCE.md`). |
| B7 | `window.__tv` debug handle is present in production builds | It exposes client state only (no credential; the gateway never sends one). Used by the evidence scripts. |

## Not implemented (by design or scope)

- Jump/vault/dive (Lane B): none; see `EXTENSIONS.md`.
- Concept enemies as canonical entities: none; previews are labelled and never spawned.
- Non-loopback browser access: not offered.
- Voiced dialogue: none (voice "babble" is a synthesised cue that follows text).
- Full accessibility audit: reduced motion, large text, high contrast, colour-vision assist, subtitles and full keyboard/pad navigation exist; a screen-reader pass was not done.
