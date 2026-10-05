# Tower expedition checkpoints

The Tower remains a self-contained playable slice within Torn Veil. Its physical or metaphysical interior is not fixed by this change.

Normal climbs save a versioned checkpoint at the start of each floor. Reload offers **Continue climb** or an explicit **New climb**. Continue reconstructs that floor and restores the same expedition/climber identities, capabilities, rolled gear, learned skill identities and slots, consumables, health, mana, progression and subsequent loot RNG. Mid-floor work rolls back to that boundary; the menu states this. Combat bodies and scene objects are rebuilt rather than serialized.

The next floor's checkpoint includes gifts, loot and progression from completed floors. Resuming it does not rerun their reward handlers. Codex and lifetime achievement receipts also prevent a floor retry from recording the same run discovery twice. Death and victory end only the matching expedition checkpoint, preserving existing retry behavior and lifetime discoveries. This adds no permanent character death rule.

The Proving Hall and explicit `floor` previews cannot overwrite an expedition. Leaving practice starts or continues a real climb; demonstration XP and modifiers are discarded. Existing Codex and achievement records remain, and legacy world saves are untouched.

Corrupt or incompatible expedition data stays in storage until the player explicitly chooses New climb. The recovery menu can download it. Unavailable storage produces a warning instead of a false saved-state claim. This first slice saves in the current browser origin; it is not cross-device/server persistence.

Checks: `npx vitest run tests/tower-checkpoint.test.ts tests/web-magic.test.ts`, root typecheck, and the actual-browser checkpoint harness. Automation verifies continuation with rolled gear and a Time-gift fixture, spell identity links, practice isolation, death and corrupt recovery. These are functional checks, not human balance approval.
