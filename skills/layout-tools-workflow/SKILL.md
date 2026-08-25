---
name: layout-tools-workflow
description: Use, troubleshoot, extend, and verify the local LayoutTools/BlockOutTools web tool in D:\GameDesgin\BlockOutTools, including local level files, AI-accessible blocks, the MYMY Unreal bridge, and keeping this skill synchronized with later tool changes. Apply when the user mentions this LayoutTools clone, localhost:4173, BlockOutTools web blocks, MYMY import/export, or changes to this repository.
---

# LayoutTools Workflow

Work against `D:\GameDesgin\BlockOutTools`. The web app normally runs at `http://127.0.0.1:4173/`; the linked Unreal project is `E:\Project\MYMY\MYMY.uproject`.

Treat the current repository as the source of truth. Before relying on a remembered button, path, schema, or behavior, inspect the relevant current file and preserve unrelated working-tree changes.

## Route The Task

- For starting the service, explaining the UI, creating layouts, local saves, AI use, or ordinary file import/export, read [references/tool-usage.md](references/tool-usage.md).
- For placing parameterized Blockout Tools blocks or importing/exporting between the page and MYMY, also read [references/ue-bridge.md](references/ue-bridge.md).
- For implementation, debugging, tests, configuration, Git work, or any behavior change, read [references/maintenance.md](references/maintenance.md).

Read only the references needed for the current request. Use `USER_MANUAL.md` when a question needs exhaustive original LayoutTools behavior; do not copy the whole manual into context by default.

## Operating Boundaries

- Do not edit `vendor/layout-tools-0.0.2.js` or the original downloaded files unless the user explicitly changes the compatibility strategy. Extend behavior through `src/` and `scripts/`.
- Browser-only layout work does not authorize UE writes. Always separate web JSON changes, UE dry-run plans, and confirmed UE apply operations.
- UE apply requires an explicit user request or confirmation, the expected project name and full `.uproject` path, and a successful dry-run. The bridge does not save the UE level.
- Local level JSON in `data/levels/` is user data and stays ignored by Git. Preserve it during tests, cleanup, and commits.
- External AI requests require the user's configured provider, model, and API key. Never read, log, or move that key into the bridge.

## Keep This Skill Current

When a task changes user-visible behavior, startup/configuration, local file handling, block types or parameters, AI behavior, UE contracts, import/export safety, tests, or known limitations, update the relevant files under `skills/layout-tools-workflow/` in the same working session.

After updating the skill:

1. Check that `SKILL.md` still routes the changed workflow correctly.
2. Update only the affected reference; do not accumulate release notes or duplicate repository documentation.
3. Run the Skill Creator validator described in [references/maintenance.md](references/maintenance.md).
4. Include the skill files in Git only when the user's requested commit scope includes the related tool change.

Initial synchronized repository baseline: commit `9991750` (`feat: persist local LayoutTools levels`), reviewed 2026-08-25. This is a historical anchor, not permission to ignore newer source or working-tree state.
