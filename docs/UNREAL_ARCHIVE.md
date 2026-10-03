# Unreal archive — 2026-10-03

Babylon.js remains the active client by user direction. The canonical TypeScript
simulation is retained. This cleanup does not change simulation mechanics.

## Recovery

- Git branch: `codex/archive-unreal-2026-10-03`, pointing to the pre-cleanup
  commit. It preserves tracked source/assets/docs, not ignored local files.
- Complete local recovery directory:
  `C:\Users\green\Desktop\projects\torn-veil-online-archives\unreal-2026-10-03`
- Its `unreal/` contains 14,717 files, 26,092,886,704 bytes, including ignored assets,
  editor output and caches. This was a same-volume directory move. File count and
  total bytes matched before/after; `inventory.json` records individual sizes.
- The original Unreal `Play Torn Veil.cmd`, native header generator
  `scripts/generate-interaction-spec.ts`, and native catalogue tagger
  `scripts/foundry/tag-catalogue.mjs` are also in that recovery directory and Git branch.
- The archive branch is pushed to `origin/codex/archive-unreal-2026-10-03` on GitHub.
  Ignored assets, caches and other local-only files remain only in the recovery directory;
  pushing the branch does not back up those files.

The recovery directory is for preservation, not a second working checkout. Restore
needed material into the authoritative repository before authoring changes. Do not
switch to the archive branch with pending cleanup changes; preserve/commit those
first. Git can restore tracked files from the archive branch; ignored assets must
come from the local recovery directory. Avoid overwriting any newer files.

This removes Unreal from the active source tree but does **not** free disk space:
its local assets are preserved on the same drive, and Git history remains. No
history rewrite, external engine uninstall, packaged installation deletion or
save deletion was performed.

## Retained shared code and historical records

Bridge transport/projection, appearance, foundry resolver and canonical interaction
specifications remain because they participate in the existing simulation/client
contracts. Their native-format fields and historical Unreal terminology are not
removed merely by name. Historical reports retain their original evidence.
Three.js remains a historical client; its removal is a separate scoped cleanup.

`Play Torn Veil.cmd` now forwards to the Babylon launcher. The prepared external
Unreal installation is untouched. Desktop shortcuts outside this checkout may
still refer to that old installation.

## Cleanup verification

- `npm run web:build`: passed, including TypeScript typecheck and Babylon production bundle.
- Observatory launcher `-CheckOnly`: passed. Normal launcher started an isolated server
  on loopback 7480; page, health and authenticated state requests passed. Browser opening
  was requested; no new visual/browser acceptance run is claimed.
- Babylon `-CheckOnly`: correctly refused because the local default preview configuration
  was absent and no world service answered on 7490. No gameplay world was created in this
  cleanup. Use a normal launch to prepare/start the isolated preview.
- `git diff --check`: passed. No `src/` changes. No full simulation suite rerun for this
  file archival / launcher / documentation cleanup. Existing art experiments and evidence
  remain untracked and untouched.
