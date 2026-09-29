# Isolated extensions (Lane B) — status

**Not started. Nothing in this branch changes what a body can do.**

The mandate separates two outcomes: a faithful client over the *existing* mechanics (Lane A, this
work) and optional new traversal/action mechanics (Lane B: a vault or dive) that must be versioned,
persisted and isolated. Jump/vault is **not** implemented canonically (`docs/SIMULATION_TO_PLAYER_COVERAGE.md`
EMB-JUMP: "would need a canonical mechanic, not a client move"), and the client must not fake it: no
mesh displacement, no invulnerability, no animation-driven movement.

## Decision

Lane B was deliberately deferred so Lane A could be finished and evidenced honestly. A partial or
cosmetic vault would violate the mandate ("do not fake displacement through meshes or add an
invulnerability window"), so no code, flag or UI for it exists, and none is reachable in any world.

## What a proper Lane B would need (recorded so the work can resume)

1. A persisted, versioned **world capability** (for example `capabilities.traversal >= 1`) that is
   **off for every existing world**, is set only when a *new or forked* world is created, and is
   never turned on silently by an update or by the client.
2. Real shared semantics in `src/sim`: collision, posture, effort, timing, interruption and save
   round-trip for the new action, used identically by players and NPCs.
3. A new protocol/spec revision (currently `tv-interaction-6`) so old clients refuse or ignore it cleanly.
4. A labelled preview environment (a fork of a checkpoint, distinct home/state/ports) — never live or
   staging — with a differential test that legacy worlds are byte-identical with the flag off.
5. Only then a client presentation for it, in this client.

## Status table

| Item | State |
|---|---|
| Persisted capability flag | not implemented |
| Canonical vault/dive mechanic | not implemented |
| Spec/protocol revision | none (still `tv-interaction-6`, protocol 1/2) |
| Preview fork environment | not created |
| Client presentation | none |
| Effect on legacy worlds | none (nothing to switch off) |
