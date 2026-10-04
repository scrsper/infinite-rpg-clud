# The Tower of Chrysanthus

A 100-floor procedural roguelite combat tower, part of Torn Veil but separate from the canonical world for now. It is the
proving ground for combat, loot, capability growth, emergent classes, gods and monsters, condensed so they can be played
and tested while the world simulation develops separately.

Play: `Play Tower of Chrysanthus.cmd` (static build on :7505), or `npm run web:dev` and open
`http://127.0.0.1:5180/?arena=1&tower=1`. Add `&seed=N` for a specific tower, or `&floor=N` to start higher (testing).
The Combat Gym panel has an **Enter the Tower of Chrysanthus** button.

## Controls (Diablo 4 layout, Witcher 3 / Elden Ring combat)

- **Camera:** classic isometric (about 35°). Drag with the middle mouse button to orbit and tilt; the wheel zooms. The view leads slightly toward your aim.
- **Move:** WASD (camera-relative), Shift sprint, mouse aim.
- **Attacks:** LMB light chain. RMB heavy: hold to charge at the wind-up and release for scaled damage, knockback and hit-stop. A heavy also finishes a light combo, and heavies chain into each other.
- **Defence:** Space dodges (a roll when moving forward). F guards; raising the guard just before a hit parries, staggering the attacker and refunding stamina.
- **Signs (1–4):** Ember (fire cone, burns), Gust (force wave, knockback, breaks guards), Ward (absorbing shield), Frost Sigil (slowing circle at the aim point). They share the stamina bar and have cooldowns. In the tower they unlock from affinities: flame→Ember, storm/swift→Gust, iron→Ward, frost→Frost Sigil. Power scales with the affinity.
- **Other keys:** Q drinks a flask (heals over a second; refilled each floor; potions add flasks). Tab cycles drawn weapons (F1–F4 select one directly). E uses a shrine. K opens the Codex.

## Monsters

Goblins (small, fast, packs of four attackers; knives), goblin archers (shortbows), orcs (huge two-handed halberd swings that break guards, heavy poise) and orc chiefs (helmeted bosses). They are MPFB bodies pushed past human with face targets (square jaws, flared noses, pointed ears), authored tusks and ears, and green skins, in the same low-poly style (`build_arena_stylized.py`). They appear from early floors alongside human raiders, soldiers, archers and mystics.

## How a climb works

- You start with **bare hands and plain cloth** (fists: jab, cross, hook, uppercut, roundhouse; kick; roll).
- Each floor is generated from (run seed, floor) by `src/web/arena/tower/floorgen.ts`:
  - **Layout:** ruined stone buildings with doorways, furnished interiors, chests, and courtyard clutter to smash.
  - **Every floor:** defeat every foe, then the door at the far wall opens. Walk through it to climb the stair.
  - **Every 5th floor:** a named boss, such as *Draun of the Black Forge*.
  - **Every 10th floor:** a god's shrine and its champion. Beat the champion, then press E at the shrine for a boon.
    The choices are the god's favour (+2 domain affinity), a pact (+30% damage for −20% health, a bane for power), or mending.
  - **Floor 100:** the summit deity.
  - **Size:** the map grows every 25 floors.
  - **Tier bands:** every 15 floors, with their own look: Root Cellars (Normal) → Iron Halls → Bronze Galleries →
    Silver Cloisters → Gilded Courts → Crystal Spires → Threshold of Chrysanthus.
- **Loot** drops from foes, chests and bosses (`items.ts`):
  - **Weapons:** the user's Torn Veil Arsenal (Oathbreaker, Execution Standard, Bell of Ruin, Veilguard, Crimson Duel,
    Serpent Tooth, Widow Cleaver, Ashwood Sentinel, Briar Whisper).
  - **Quality:** Worn → Common → Fine → Masterwork → Relic, rising with the floor. High-quality weapons can carry an element.
  - **Other drops:** armour (damage reduction), skill tomes (flame, frost, storm, swiftness, iron, shadow, verdance) and
    healing draughts.
  - **Picking up:** walk over an item. A better item replaces the current one; a worse one is salvaged into proficiency.
- **Death** ends the run (roguelite). R begins a new climb.

## Constitution alignment

- **§12 Capability before class / §IX.** The truth is the `CapabilitySheet` (`capability.ts`):
  - Style proficiency (fists, blade, heavy, axe, bow) grows with landed blows and kills.
  - Elemental affinities come from tomes and boons, and grow slowly with use.
  - History is tracked: kills, bosses, floors, tomes, boons, and floors fought without a weapon.
- **Emergent classes.** A class emerges when the sheet matches a qualifying pattern:
  - A dominant style alone: Brawler, Blademaster, Warden, Reaver, Ranger.
  - Style plus a dominant affinity: a composed name such as **Stormfist**, Flamebrand, Rimeshot or Thornbreaker.
  - An earned exception: **Iron Ascetic** (fists rank 4+, three or more floors fought without a weapon).
  - Classes evolve as the pattern changes, and grant a modest boon.
- **§60 Emergent progression meta.** Every discovered class is written to the **Codex** (press K) with its qualifying
  pattern, tier, first floor and seed. It is stored in the browser and can be exported as JSON. A shared server Codex is
  the multiplayer step.
- **§13–14 Tiers are summaries.** Your tier (Normal → Iron → … → God) is computed from measured capability, not from the
  floor number.
- **§42 Gods are entities.** Pyrrhos (flame), Isveld (frost), Thalor (storm), Ysra (swift), Ankh-Varro (iron), Nyx-Sel
  (shadow) and Maelith (verdance) each have a domain and offer domain boons. Pacts trade a bane for power.

Elemental effects on your blows (`tower.ts`):
- **Flame:** burns (damage over time).
- **Frost:** chills (slows movement).
- **Storm:** chains to nearby foes.
- **Shadow:** a second strike.
- **Verdance:** heals you.
- **Swiftness:** attack and move speed.
- **Iron:** armour and health.

## Status (2026-10-03)

| Feature | Status | Evidence |
|---|---|---|
| Floors 1–100 generate (seeded, sizes, bands, boss/shrine/summit) | VERIFIED (floors 1–11, 25, 47 loaded) | `scripts/web/tower-climb.ts` runs |
| Clear → door → stair → next floor | VERIFIED | Bot climbed 1→8 in 200 s |
| Loot drops and pickups, weapon unlocks, armour | VERIFIED | Worn/Common weapons, Common and Fine armour picked up |
| Emergent classes plus Codex | VERIFIED | Brawler → Warden (switched to greatsword); Stormfist after Thalor's boon |
| Boss floors with boss bar | VERIFIED (floor 5 cleared, floor 25 boss spawned) | climb reports |
| God shrine boons | VERIFIED (Thalor) | `climb-shrine` cards screenshot |
| Navigation around ruins (foes, companions) | IMPLEMENTED, bot-verified | Grid flow field in `nav.ts` |
| Elemental effects | IMPLEMENTED BUT UNVERIFIED visually | Storm affinity reached 2; procs not inspected frame by frame |
| Balance beyond floor ~12 | UNVERIFIED | Needs human play |
| Multiplayer | NOT STARTED | See roadmap |

All runs are automation evidence, not human playtests.

## Roadmap (next steps, in order)

1. **Human play feedback** on floors 1–15: pace, loot rate, difficulty curve, and how class emergence feels.
2. **Monster variety:** skeletons, liches, necromancers, cultists, orcs, goblins, pixies, griffins. Each needs a body
   (CC0 or authored in Blender), a moveset and behaviour (casters, flyers, swarms).
3. **More floor objectives:** survive, rescue an NPC, destroy a ritual, timed escape, puzzle doors, friendly or neutral NPCs.
4. **Abilities:** active skills from tomes (fire burst, frost nova, lightning dash), plus more pattern-driven classes and
   class evolutions.
5. **Multiplayer:** a small authoritative room server on the existing gateway/websocket stack. Friends join a climb in
   the browser, there is a shared server-side Codex, and you can watch or co-play together.
6. **Persistence:** run history and the global Codex on the server; meta-unlocks if wanted.
7. **Integration** into the canonical world later, as a dungeon (Constitution §41) once combat rules are settled.
