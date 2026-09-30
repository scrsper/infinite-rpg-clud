# Play Torn Veil Web — controls

The bindings deliberately mirror `docs/LIVING_ALPHA_CONTROLS.md`, so moving between the Unreal client
and the browser keeps the same hands. Everything is rebindable in **Esc → Controls** except Pause.
Click the game once to capture the mouse; Esc releases it and opens the pause menu.

| Do | Keyboard & mouse | Controller (standard mapping) |
|---|---|---|
| Move | W A S D (arrows) | Left stick |
| Look | Mouse | Right stick |
| Sprint | Left Shift (hold; optional toggle) | L3 |
| Crouch | C / Left Ctrl (toggle in Abilities) | — |
| Interact / talk | E | A / Cross |
| Light strike | Left mouse | X / Square |
| Heavy strike | G (or mouse button 4) | Y / Triangle |
| Guard / timed parry | Right mouse (hold; optional toggle) | LB / L1 |
| Dodge (with a direction) | Space / Left Alt + a direction | B / Circle |
| Focus | Z (or mouse button 5) | LT / L2 |
| Lock target / switch | F or middle mouse / T | R3 / D-pad right |
| Hush (calm a beast, once taught) | Q | RT / R2 |
| Quick item | R | RB / R1 |
| Items / Abilities / Journal | I / Tab / J | D-pad left or up / D-pad down / View |
| Pause & settings | Esc | Menu |

In conversation, number keys 1–9 choose the numbered option; Enter/Space confirms the focused one;
Esc leaves. Menus navigate with the arrow keys / W A S D or the D-pad; Q / E (LB / RB) switch tabs.

## What a strike, guard and dodge really do

The client sends only the *intention* (`attack` light/heavy, `guard` held, `defend` sidestep/backstep/duck
with a direction). The server decides timing, contact and outcome under the same rules as every other
body. The character starts moving the instant you press (client-side anticipation), and the server's
own action timing takes over: a rejected input cancels the anticipated motion instead of pretending.
Light strikes chain jab → cross when pressed within about 0.9 s; heavy strikes chain front kick →
round kick. There is no slow-motion and no invulnerability window; effort is spent by the server.

## Settings that matter

Mouse/stick sensitivity and inversion, dead zones, hold-or-toggle for sprint/focus/guard, field of
view, camera shake (0 turns it off), **reduced motion**, quality tier (auto, high, balanced, low) and
resolution scale, master/music/effects/ambience/voice volumes, UI scale (0.85–1.4), large text,
high contrast, subtitles, hints on/off, and colour-vision assist. Settings live in the browser's local
storage for that browser profile; clearing site data resets them.

## Renderer

WebGPU is used when the browser provides it. Otherwise (or with `?renderer=webgl2` for testing) the
client falls back to WebGL 2 with a reduced-effects tier (no bloom, no MSAA, no grass tufts, fewer
lights and shorter draw distance). The renderer in use is shown in the pause menu's graphics settings.
