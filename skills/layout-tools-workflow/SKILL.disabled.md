---
name: layout-tools-workflow
description: Use, extend and verify BlockOutTools V2 in D:\GameDesgin\BlockOutTools, including module editing, port assembly, local project files and calibrated diagram ingestion.
---

# 已停用：BlockOutTools V2 workflow

2026-09-14：用户指出此技能已过时，撤下 SKILL.md 入口。以下内容仅作历史记录，不作为当前操作要求。

Work in `D:\GameDesgin\BlockOutTools`. Current product code is `app-v2/`, served on 4174. Requirements live in `docs/rebuild/`. Legacy host instructions are historical, not current capabilities.

Read [tool usage](references/tool-usage.md) for operation, files, modules and diagram input. Read [maintenance](references/maintenance.md) for implementation, verification and Git. For UE parameter limits read `docs/rebuild/UE_PARAMETRIC_BLOCKS_CONTRACT.md`; the measured plugin schema is missing, so do not invent Blueprint parity.

For block selection, construction or extension, read `app-v2/src/domain/block-library/README.md` and `app-v2/src/domain/block-library/common-rules.md` relative to the workspace, then only the selected type's `definition.json`, `usage.md` and needed examples. Apply the current project's blockoutProfile separately. Box usage is user-confirmed; other types describe current implementation, and UE parity remains unverified. Do not infer runtime support from a folder alone. New defaults affect new blocks only; preserve existing identities and saved parameters. Regenerate the index with `node scripts/generate-block-library-index.mjs`; check it with `--check`.

Preserve user data and unrelated changes. `data/levels/` and `data/projects-v2/` are shared project data and may be committed when requested. Tests use temporary project libraries via `BLOCKOUT_V2_DATA_DIR`.

Browser work does not authorize UE writes. Current UE panel is local dry-run only. Linked project is `E:\Project\MYMY\MYMY.uproject`; actual Apply requires a separate explicit request and verified target.

Keep these references synchronized with user-visible changes. Validate with `python C:\Users\zhaowenbo\.codex\skills\.system\skill-creator\scripts\quick_validate.py D:\GameDesgin\BlockOutTools\skills\layout-tools-workflow`. This validator checks skill structure, not browser or UE behavior.
