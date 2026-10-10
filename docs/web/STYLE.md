# Web client — visual and audio direction

Direction comes from the two supplied concept sheets (`art/reference/web-rebirth/`), interpreted as
*stylised fantasy realism*: readable silhouettes, restrained saturated accents, painterly light, no
photorealism claim. The world itself stays the simulation's world; art never moves a wall or a door.

## From the references

**World and creatures board** → cool slate-and-moss landscape, warm lantern/window light against blue
dusk, timber-and-plaster settlements with real gabled roofs fitted to the simulation's roof cells,
forest with a tiled vegetation LOD, atmospheric fog. The four enemy concepts (Veil Wraith, Shattered
Colossus, Void Stag, Rift Hawk) are built as **labelled previews** (`?showroom=…`): the simulation has
no flight, incorporeality, giants, those species or magic, so they are never spawned as canonical
entities, and a deer is never dressed up as a monster. The wildlife that does exist (roe deer,
woodland boar, field hare) uses its own quadruped models and gait.

**Ice character sheet** → the hero preview: silver hair, animal ears and tail with secondary spring
motion, ivory fur trim, white-and-blue snowflake kimono with gold and crystal ornaments
(`?showroom=hero`, badge "Art preview — hero concept"). These features are appearance tokens for the
showroom only; the player's canonical body, from the server, is what plays.

## Palette (`src/web/ui/theme.css`)

| Role | Value |
|---|---|
| Surfaces (charcoal → slate) | `#0d1016` `#131821` `#1a212c` `#232c3a` `#2e3a4c` |
| Text (ivory) / dim / muted | `#f0eadb` / `#cfc8b6` / `#9aa1b0` |
| Rules and highlights (pale gold) | `#dcc27e` (dim `#a48f57`) |
| Calm / veil information (ice blue) | `#8fb5e3` (dim `#5f86b8`) |
| Danger (crimson) | `#d15660` (dim `#8e2f38`) |
| Good / caution | moss `#86b078` / amber `#e0a24a` |

Panels are slate with a pale-gold hairline and corner brackets; headings use a serif small-caps
treatment (Palatino/Georgia), body text a system sans. High-contrast mode swaps to near-black panels
and white type. Text is never below **16 px** at 720p (root size scales with viewport and the UI scale
setting, 17 px base, 0.85–1.4×) and larger at 1080p/1440p.

## Scene lighting and colour

ACES tone mapping; a sun/moon key with cascaded shadows, a hemispheric fill, fog and sky driven only by
the projected world time and weather; local lights (torches, windows, hearths) pooled by distance.
Vertex colours are authored in sRGB and converted to linear once at load. Default art-direction
multipliers are `key 1.05, fill 1.3, exposure 1.18` (`src/web/world/atmosphere.ts`); tune live with
`?look=key:1.2,fill:1.3,exposure:1.4,fog:1`. Night is dark on purpose but stays readable through fill and
local light. Weather is rendered from the simulation's own state (rain particles from
`weatherFx.ts`); there is no cosmetic weather the world did not have.

## Characters

Three shared kits (female, male, child) with morph-target heads, 14 garment types, 16 hairstyles,
footwear, hats and accessories, coloured from each person's canonical appearance tokens so the same
person looks the same on every client. Faces have blink and mouth shapes (speech drives them).
Procedural animation over the kit: a distance-driven gait built from human gait curves (`src/web/actors/gait.ts`: heel strike, loading knee, toe-off, a run with flight, pelvis bob/shift/drop, thorax counter-rotation, stabilised head, accel lean and turn bank), a weight-shifting idle, upper/lower-body layering, posture, activity
poses (work, eat, drink, talk, rest, carry), injury limp, secondary motion for hair, tail and ears,
and combat poses driven by the server action's own preparation/active/recovery timings.

## Combat feel (John Woo-inspired, translated)

Kinetic lateral evasion, committed strikes with visible wind-up, contact and recovery, graceful
redirection, close-range exchanges — expressed through pose, footwork, camera framing and audio, and
**never** through slowing the shared clock, giving the local player bullet-time, or lagging a rendered
root away from the truth. No guns and no borrowed scenes. Contact effects appear only at confirmed contact
locations; a miss has no blood.

## Audio (`src/web/audio/audio.ts`)

Everything is synthesised at runtime (Web Audio): ambience by indoors/outdoors, hour, weather, wind and nearby fires (birds by day, crickets by night, rain), footsteps by
surface and gait, strike/guard/parry/hit layers, UI ticks, voice "babble" that follows lines of dialogue
(there is no voiced dialogue and none is implied). Buses: master, music, effects, ambience, voice.
Audio starts on the first user gesture, per browser rules.

## What is not art-complete

Building interiors are simple but honest (real walls, windows, furniture from the projection);
faces and hands are stylised low-detail; hero tail/hair volume, creature barrel shapes and boar colour
are known rough spots; the distant vista and clouds are plain. See `KNOWN_DEFECTS.md`. Whether the art
reads as *good* is a human judgement that is still pending (`HUMAN_TEST_GUIDE.md`).
