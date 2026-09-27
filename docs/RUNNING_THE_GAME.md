# Running Torn Veil

## Installed Windows game

Double-click **Play Torn Veil** on the desktop, or **Play Torn Veil.cmd** in the
repository root. This opens the packaged Unreal Living Alpha client using the
prepared private sign-in profile. Select or create your character in the game.

The launcher starts the preserved staging service if necessary, checks the package
and connection, and takes normal before/after world backups. Leave its launcher
window open while playing. Quit through **Escape → Quit** and let the launcher
finish its final backup. The 50-minute telemetry observer does not impose a play
time limit. No editor, build, browser development server or manual server command
is needed for this installed package.

To check installation and server readiness without opening the game:

```powershell
& '.\Play Torn Veil.cmd' -CheckOnly
```

| Action | Keyboard / mouse |
|---|---|
| Move / look | WASD / mouse |
| Sprint / interact | Shift / E |
| Light strike / guard | Left / right mouse |
| Dodge | Alt + movement |
| Inventory / abilities / journal | I / Tab / J |
| Pause, settings, reconnect, quit | Escape |

Full keyboard and controller mappings: [Living Alpha controls](LIVING_ALPHA_CONTROLS.md).
Jump/vault is not implemented. Clothing clipping and other presentation limitations
remain; physical controller acceptance still requires human play.

## Installed version and saved world

The accepted package is `client-450b7e5cbc80`, server `0.1.0-alpha.30+450b7e5cbc80`,
on staging port **7410**. Runtime source commit `450b7e5cbc80646e6c5a143f58214831d85445b6`
is in GitHub `main`. The merge and repository cleanup do not change that runtime;
the existing package and recorded verification remain applicable.

This machine's prepared launcher is:

```text
C:\Users\green\TornVeilAlpha\playtests\alpha30-450b7e5\Play.cmd
```

Saved worlds, private profiles, release bundles and packaged clients live under
`C:\Users\green\TornVeilAlpha`; backups live under `D:\TornVeilAlpha\backups`.
The older live service on port 7400 remains separate. Repository cleanup did not
deploy over it or replace either saved world. Session evidence is written beneath
the playtest directory.

The root launcher requires this prepared installation. A fresh Git clone alone
does not contain the private profile, licensed local assets or packaged executable.
For development or another machine, consult [the release record](LIVING_ALPHA_RELEASE.md)
and `unreal/scripts/Package-Client.ps1` / `Start-AlphaClient.ps1`.

## Source of truth and recovery

GitHub **`scrsper/torn-veil-online`, branch `main`**, is the source baseline. On this
machine, use `C:\Users\green\Documents\ChatGPT\TornVeilOnline` for current development.
The Desktop and prior release checkouts are synchronized copies of `main`; their
ignored assets/evidence remain available. Start future work from freshly fetched
`main` and integrate completed work back through review.

The 2026-09-27 cleanup retired 21 remote feature branches and 47 local branch refs
across three clones. Fourteen remote branches were already contained in `main`;
the seven remaining historical tips are preserved on GitHub as
`archive/2026-09-27/<original-branch>` tags. Those tags preserve experiments and
superseded implementations; they are not extra features to merge automatically.

Complete Git bundles, original branch manifests, Desktop working-file copies and
patches, and six historical worktree directories are preserved at:

```text
C:\Users\green\TornVeilRepoArchive\2026-09-27-consolidation
```

The Desktop edits also remain in that clone's named consolidation stash. Local
commits outside `main` have local archive tags. Historical worktrees are detached
and locked in the archive; licensed/ignored content and test saves were retained.
The separate `TornVeilAlpha/source-checkpoints` baseline remains historical evidence.
Restore specific work from these records only after comparing it with current `main`.
