# Third-person camera

One adaptive camera serves the world client, the Combat Gym arena and the Tower of Chrysanthus
(`src/web/game/adaptiveCamera.ts`).

It is an elevated, freely orbitable view aimed at the player's chest. It sits a little higher and farther back than
The Witcher 3: enough awareness to see the living world around you, while still being a camera attached to a person,
not an isometric map.

It is presentation only. It reads drawn positions and the snapshot, then returns a camera pose. Nothing in the
simulation reads it, and NPC behaviour never depends on what the camera sees.

## Framing

| | Value |
|---|---|
| Default distance | 6.8 m (7.6 m in the arena, whose people are drawn 1.22×) |
| Pitch | about 20° down; orbit range 4°–50° |
| Height | about 3.7 m above the feet |
| FOV | about 65° (world client: the FOV setting + 3°) |
| Target | upper torso/chest, with 0.9 m of extra ground ahead in view and a small lead in the direction of travel |
| Player size | about 18–20% of screen height |
| Zoom | wheel, 2.6–10 m. Your chosen distance persists; situations modulate it and then return to it |

## One continuous camera

The same camera adapts to the situation instead of switching between separate modes:

- **Exploration:** the default framing.
- **Small fight** (one or two foes): about 8% closer and 1.5° lower.
- **Group fight** (three or more threats within 12 m): up to 30% farther back, 2–6° higher and a slightly wider FOV.
- **Large creature** (taller than 3 m nearby): far enough back for its scale to read, up to the exceptional 14 m.
- **Interior** (built structure overhead): closer and flatter, so the camera stays inside the room.
- **Precision aiming** (arena bow, RMB): a temporary over-the-shoulder framing at 3.4 m.

When you orbit while standing still, the body does not turn. Movement stays camera-relative: forward is the camera's
forward on the ground.

In combat with a lock, the yaw drifts gently toward the target, but only after 0.8 s without look input. It never
fights the player.

## Obstruction

- **Detection:** a fat ray made of a centre ray and four offsets is marched against built structure. In the world
  client that is the structure and plant queries; in the arena, the collision boxes of walls and tall props. A thin
  post grazing one edge ray doesn't collapse the camera.
- **Pull-in:** immediate, so no frame is spent inside a wall.
- **Recovery:** after the view has been clear for 0.18 s, then eased. This hysteresis prevents in/out popping.
- **Rising over:** when the view is blocked well short, the camera rises over the obstacle if the view from higher up
  is clear. It also rises when a low wall, fence or cart hides the player's hips.
- **Forced close:** the target lifts toward the head and the pitch rises gently, so the frame shows head and
  shoulders rather than a torso.
- **Ground:** the camera never goes below the ground.

Cost: the camera update measured 0.07 ms per frame in the town.

## Development presets

Add `?cam=exploration|close|wide|group|large|interior` to the URL. From the console you can also call:
- `__tv.rig.preset('group')` in the world client (`'off'` clears it);
- `__arena.camPreset('large')` in the arena or Tower.

## Evidence

- **Harnesses:**
  - `scripts/web/camera-pass.ts`: town and gym, with crowd, wall-obstruction, zoom, combat and frame-time steps.
  - `scripts/web/arena-camera.ts`: gym arena and Tower, with bow aim, crowds, a ruin wall and a boss.
- **Tests:** `tests/web-adaptive-camera.test.ts`.
- **Screenshots:** `.debug/web/camera-v*` and `.debug/arena/arena-camera*`.

This is automation evidence, not a human playtest; feel (mouse sensitivity, damping) still wants hands-on tuning.
