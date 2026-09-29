# Human test guide — Play Torn Veil Web (one page)

**Status: every verdict below is PENDING.** No human has played this client. The automated runs in
`EVIDENCE.md` use scripted keyboard/mouse input and *say nothing about feel, clarity, art quality or
enjoyment*, and no physical controller has been used at all.

## Set-up (5 minutes)

1. Use Chrome or Edge on the Windows machine with the RX 6650 XT (WebGPU is the intended path).
2. In the repository: `npm run web:build` (and `npm run web:assets` if models are missing).
3. Start the preview world if it is not running (see `ROLLBACK.md`), then double-click
   **`Play Torn Veil Web.cmd`**. If it stops, read the `[stop]` line; it changed nothing.
4. This is the isolated preview world (dev environment, seed 918271). It is not your live or staging
   world. Play at 1080p, mouse and keyboard first; then a controller if you have one.

## What to try (30–45 minutes, in any order you like)

| # | Try | You are judging |
|---|---|---|
| 1 | First two minutes: do you know who you are, how to move, and what to do next without asking? | onboarding clarity |
| 2 | Walk and sprint across the village and into the woods; turn quickly; stop. | movement response and camera comfort |
| 3 | Walk up to a villager and talk (E). Read, choose, buy or decline, leave. | conversation and trade clarity, portrait, confirmations |
| 4 | Open Items (I), Abilities (Tab), Journal (J). Eat or drink something if you can. | menu legibility and honesty |
| 5 | Strike, chain a second strike, guard, dodge sideways. Fight a boar if one is near (expect to lose effort and maybe health). | combat readability, timing, hit feedback |
| 6 | Enter a building; look from inside; stand in a doorway. | camera in tight spaces |
| 7 | Change settings (sensitivity, FOV, text size, reduced motion, remap a key). | settings, accessibility |
| 8 | Esc → Save the world now → Reconnect. | save/reconnect flow |
| 9 | Look at night and in rain if the world's time gets there. | lighting and mood |
| 10 | `?showroom=hero` and `?showroom=kit_f` in the address bar. | art against the concept sheets |

## Verdict sheet

Mark each **PASS / FAIL / UNSURE** with one sentence. Leave blank = not done.

| Area | Verdict | Note |
|---|---|---|
| Launch → playing without a console or manual server step | PENDING | |
| Controls understandable within 2 minutes | PENDING | |
| Movement and camera feel | PENDING | |
| Conversation and trade UI | PENDING | |
| Combat readable and controllable | PENDING | |
| Art direction reads as the concept sheets | PENDING | |
| Performance feels smooth (no visible stutter) | PENDING | |
| Audio | PENDING | |
| Settings and accessibility | PENDING | |
| Controller (physical) end to end | PENDING — not tested by anyone | |
| Save / reconnect / return | PENDING | |
| "I would keep playing" | PENDING | |

## Please report

- Anything that blocked you, confused you, or felt unfair (what you pressed and what you expected).
- Any moment the game stuttered (rough time and where you were).
- Anything that looked wrong (a person floating, a wall you walked through, a door that is not one).
- If the launcher stopped: paste its `[stop]` lines.

If the character dies, that is the world's consequence, not a bug; use "Return to title" and a new life.
