---
name: layout-tools-workflow
description: Use, extend and verify BlockOutTools V2 in D:\GameDesgin\BlockOutTools, including module editing, port assembly, local project files and calibrated diagram ingestion.
---

# BlockOutTools V2 workflow

Work in `D:\GameDesgin\BlockOutTools`. Current product code is `app-v2/`, served on 4174. Requirements live in `docs/rebuild/`. Legacy host instructions are historical, not current capabilities.

Read [tool usage](references/tool-usage.md) for operation, files, modules and diagram input. Read [maintenance](references/maintenance.md) for implementation, verification and Git. For UE parameter limits read `docs/rebuild/UE_PARAMETRIC_BLOCKS_CONTRACT.md`; the measured plugin schema is missing, so do not invent Blueprint parity.

Preserve user data and unrelated changes. `data/levels/` and `data/projects-v2/` are shared project data and may be committed when requested. Tests use temporary project libraries via `BLOCKOUT_V2_DATA_DIR`.

Browser work does not authorize UE writes. Current UE panel is local dry-run only. Linked project is `E:\Project\MYMY\MYMY.uproject`; actual Apply requires a separate explicit request and verified target.

Keep these references synchronized with user-visible changes. Validate with `python C:\Users\zhaowenbo\.codex\skills\.system\skill-creator\scripts\quick_validate.py D:\GameDesgin\BlockOutTools\skills\layout-tools-workflow`. This validator checks skill structure, not browser or UE behavior.
