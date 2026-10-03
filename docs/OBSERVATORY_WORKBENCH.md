# Observatory workbench

The Observatory can display its own isolated simulation through the existing Babylon
client. It does not connect to the separate `web-quality`, live or staging save.

## Use it

1. Build the browser client with `npm run web:build` (local character GLBs are required).
2. Open **Torn Veil Observatory.cmd**. The launcher preserves older servers and opens a
   workbench-capable revision on another available port when necessary.
3. Select a living person, then **Play selected person** in the Game viewport panel.
   This takes external control of that existing person; it does not spawn a duplicate.
4. **Resume** at **1×**, click the viewport, and use the ordinary Babylon controls.
   Press **Escape** to release the pointer and work with the surrounding inspectors.
5. **Pause**, inspect decisions, or use **+1 hour**. The viewport and inspectors read
   the same World object. Time advancement rejects player input until it finishes.
6. **Release character / close** returns that person to autonomous simulation.

Drag a panel by its dotted handle to reorder it. Arrow buttons provide a keyboard
alternative. Choose a width, drag its lower-right resize handle, or collapse it.
Panel order, widths, explicit heights and collapse state persist in local browser
storage. **Reset panel layout** restores People / Game viewport / Person inspector
with the other panels below. No canonical state is stored in layout preferences.

## Authority and lifecycle

The viewport attaches the existing `BridgeSession` to the Observatory's World and
Simulation instances. It reuses the Babylon App, ordinary canonical command queue,
perception-filtered gameplay snapshots, local prediction and rendering. Developer
truth remains in inspector panels; it is not copied into character knowledge.

Opening the viewport explicitly enables the existing 60 Hz gameplay scheduler for
that world. The ordinary headless Observatory retains its 0.15-second step until
this opt-in. Historical headless determinism/validation receipts are not evidence
of equivalent gameplay trajectories. The footer identifies the active mode.

Only one viewport owns a controller. Pause, speed changes and time advances cancel
pending input and rotate its binding. Commands are rejected while paused, running
a bounded advance, or faster than 1×. A closed/lost viewport releases ownership;
an abandoned lease expires after five seconds. A world reset or checkpoint restore
invalidates old bindings. Reopen the viewport for the replacement world. Restored
people are autonomous until explicitly controlled again.

Checkpoints and the game's Save command store only an in-memory Observatory
checkpoint. They do not write a gameplay save. Reset/restore returns to headless
mode. Run-without-player releases the viewport controller before autonomous work.

The iframe is same-origin and uses the existing Observatory session token. No public
binding, arbitrary file path, new external service or second simulation writer is
introduced. Dense reference-world geometry is projected through the shared region
projection, without changing the canonical terrain or adding a geographic world.

## Current bounds

This is an initial development workbench, not a full scene editor. It offers panel
reordering and width/height controls, not floating windows or nested docking tabs.
The viewport currently streams the controlled person's region, refreshes dynamic
state while watching, and refreshes static geometry at least once per world hour.
Large-world multi-region journeys are not accepted by this workbench slice.
The HTTP adapter is for loopback development; it is not a replacement multiplayer
transport. Headless replay checks remain labeled as separate fixture evidence.
The game client skips its standalone pre-warm stage when embedded, compiling
needed shaders as they become visible. First-frame stutter is possible.
