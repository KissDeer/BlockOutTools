---
name: souls-level-builder
description: 用 BlockOutTools V2 构建并导入 UE 的魂系白盒关卡。当用户要在本仓库（I:\BlockOutTools）里设计 a Souls-like 关卡、复用已有参考关卡、或沿用 UE 白盒规范时使用。每次关卡迭代都会修正本 skill 并扩充其作用。
---

# 魂系关卡构建 Skill（BlockOutTools V2）

## 1. 用途

在 BlockOutTools V2 的领域模型内构建“可导入 UE 的魂系白盒（blockout）关卡”，并明确报告：(a) 当前缺什么信息/内容/工具，(b) UE 接入的困难。本 skill 随每次真实关卡迭代被修正与扩充，是项目流程的单一参考。

## 2. 事实基线（重要，先读）

从 `app-v2/src/domain/*` 与 `docs/rebuild/*` 核实的事实，先于任何假设：

- **领域模型**（`types.ts`）：`BlockoutProject` → `ModuleDefinition`（含 `blocks`）→ `ModuleInstance`（含 `assemblyTransform`、`graphPosition`）→ `Connection`（带类型与 waypoints）。单位是 cm，旋转是角度。
- **可部署积木类型**（`catalog.ts`，仅 4 种）：`box`(Blockout_Box)、`doorway`(Blockout_Doorway)、`stairs-linear`(Blockout_Stairs_Linear)、`port`(模块出入口，不可部署)。**没有专门的墙/地板/坡道/螺旋梯/电梯/坑/梯子积木**。
- **积木默认参数**：
  - box：`BoxSize [600,400,40]`、`blockout_material_color`、`blockout_material_top_color`。
  - doorway：`DoorwaySize [40,140,240]`、`TopThickness 40`、`SideThickness 40`。
  - stairs-linear：`StairsSize [180,360,180]`、`NumberOfSteps 10`、`StairsType BOX|CLOSED|SLOPED`。
  - port：`width 120`、`depth 80`。
- **约定色彩**（沿用现有参考关卡）：地板用浅灰蓝 `boxout_material_color 约 [0.46,0.49,0.51]`，顶面 `[0.66,0.69,0.7]`；墙体用深灰 `[0.055,0.06,0.058]`，顶面 `[0.16,0.17,0.165]`；楼梯/门洞用金色，体色 `[0.77,0.59,0.13]`、顶面 `[0.94,0.78,0.28]`。非必须，但用于一致可读的白盒。
- **坐标系**（`ue-plan.ts`）：网页 `X→UE X`、网页 `Y→UE -Y`（取负）、网页旋转 → `-yaw`（ue-plan 里 `-[rotation]`）。实例 Transform + 积木局部 Transform 组合成世界坐标；Actor 同步键 = `projectId+instanceId+blockId`。
- **UE dry-run 是纯本地计划**：`UEDryRunPanel.tsx` 明示“本地 dry-run · 未连接 UE”，不执行 Apply。`config/ue-parametric-blocks.json`（README 指向的 UE 实测 Blockout 蓝图 Schema）**当前不在仓库中**。
- **连接类型的固定单跳垂直差**（`assembly-resolver.ts` 的 `CONNECTION_RULES`）：`door`/`one-way-door`=+0cm、`stairs`=+400/300、`spiral-stairs`=`elevator`=`one-way-elevator`=+0/300、`road`=+500/0、`drop`=+250/-300。**多层级大落差捷径无法用单条连接零残差表达。**
- **参考关卡已存在于仓库**（可直接作为风格/几何模板）：`layouts/lothric-high-wall-v2.blockout.json`（零斯里克高墙）、`layouts/elysian-boulevard-v2.blockout.json`、`layouts/elysian-boulevard-rebuild.blockout.json`、`layouts/elysian-boulevard-rebuild-plan.svg/png`。生成脚本在 `scripts/`。
- **自创示例关卡**：`layouts/sunken-sanctum.blockout.json`（9 模块 · 124 块 · 含捷径闭环，报告 2 条残差；104 个 UE Actor）与 `layouts/sunken-sanctum-spine.blockout.json`（干净主轴+五条死胡同支线，0 残差）；设计蓝图见 `docs/levels/sunken-sanctum-design.md`。

## 3. 构建流程

1. 打开/新建项目文件（JSON，`schemaVersion: 2`）。可用 `scripts/generate-*.mjs` 或手写；正式文件用相对路径，模块几何只存模块文件（本 skill 当前为单文件演示时，模块内嵌在 project JSON 中）。
2. 定义**模块 = 一片楼层/区域**。用 `box` 铺地板（宽、浅、`BoxSize=[长,宽,40]`），用多个薄 `box` 围墙（`BoxSize=[段长,厚度,高]`，段间小量重合避免缝隙），`doorway` 开门洞，`stairs-linear` 做垂直连接。
3. 在墙/边界放 `port` 标注出入口；在外层 `connections` 用类型连接实例端口（door / one-way-door / stairs / spiral-stairs / elevator / one-way-elevator / road / drop）。
4. 用 `blockoutProfile`（capsuleRadius、maxStepHeight、minDoorWidth/Height、maxStairRise、minStairTread）做可走性约束。
5. 生成 UE dry-run（`buildLocalUEDryRun`）并人工核对 actor 数量、位置、端口残差。

> 离线校验用 `node scripts/validate-blockout.mjs <关卡.json>`：结构 + 白盒规范 + 装配求解（复算残差）+ UE dry-run Actor 计数；再叠 `node scripts/validate-schema.mjs <关卡.json>`：严格复刻 app 内 `project-schema.ts` 的 Zod 校验，确认文件能被 app 的“打开 V2 项目”接受。两脚本把 `assembly-resolver.ts`/`ue-plan.ts`/`project-schema.ts` 的算法移植为纯 Node，因 sandbox 无法跑 vite/vitest（esbuild 原生子进程 `spawn EPERM`）；浏览器/`npm test` 版本仍以 app 内域逻辑为准。

> **权威核对（用 app 真实代码）**：在 `app-v2` 里 `npm run verify:level`（`tsc -p tsconfig.domain-cjs.json && node verify-domain.cjs`）会把域逻辑编译成 CommonJS 运行，用**真实的 `projectSchema`/`resolveAssembly`/`buildLocalUEDryRun`/`validateProject`** 核对关卡。已用该法确认本仓库全部关卡文件的校验结果与离线脚本一致（主轴 0 残差、捷径 2 残差、数值完全吻合）。

> 落地 UE：`node scripts/export-ue-actors.mjs <关卡.json>` 产出可直接交给 UE 设计师的 Actor 计划（`ue-plan/<关卡>.actors.json`），含 `syncKey`(=projectId/instanceId/blockId，注意与 `ids.ts` 的 `/` 分隔一致)、`blueprintClassPath`、已换算的 `location`/`rotation`/`parameters` 与装配残差。UE 操作步骤见 `docs/UE_IMPORT_GUIDE.md`；批量自动生成可用参考脚本 `scripts/ue_unreal_spawn.py`（UE Python/unreal，未在本机验证，需按 UE 版本核对 API）。

> 看图（无需 app/UE）：`node scripts/render-sunken-sanctum-plan.mjs <关卡.json> <out.svg>` 用**装配求解后**的世界坐标生成顶视平面图 + 垂直 Z 剖面 SVG（示例：`layouts/sunken-sanctum-plan.svg`），便于核对空间关系与垂直落差。

> **环境限制**：本沙盒无法启动项目的 Vite 开发服务器（esbuild 加载 `vite.config.ts` 时 `spawn EPERM`），因此不能在本机直接渲染 web 界面的 2D/3D/UE dry-run；需在用户机器用 `Start-BlockOutTools-V2.cmd`（`http://127.0.0.1:4174/`）打开并加载本关卡 JSON 做真机核对。这属于 UE/预览验证的环境困难，非关卡缺陷。

## 4. 魂系关卡设计要点（几何层面）

- 垂直落差 + 单向坠落 + 捷径回环是魂系核心；用 `stairs-linear`、portal 类型 `drop`/`elevator` 表达。
- 因为缺少坡道/螺旋梯/电梯积木，这些只能退化为 `box` 或 `stairs-linear` 近似，需在报告里显式说明 UE 侧会得到什么。
- 白盒不关心美术风格，只关心几何意图与“谁以何种方式通过”。命名与色彩仅用于可读性。

### 4.1 设计蓝图模板（新建关卡先填这个）

- **概念/建筑风格**：一句话场景设定 + 风格（哥特圣殿 / 维多利亚机关城 / 暗黑地牢 / 石殿…）。
- **模块表**：每模块 = 一片楼层或区域（`模块名 / 层级 z / 说明 / 关键内容与接口`）。
- **拓扑与连接**：主轴用 `stairs`(+300) 竖向爬升；捷径用 `one-way-door`/`drop` 回环。逐条列出 `源模块:端口 → 目标模块:端口 : 连接类型`。
- **规范参数**：沿用或覆盖 `blockoutProfile`。
- **待确认/待提供**：UE 素材（config schema、.uproject、复用地块库）、风格确认、残差接受策略。

### 4.2 闭环捷径的残差预期（重要）

求解器以“第一条连接的源实例”为锚点做 BFS（`assembly-resolver.ts`）。当捷径闭环直接连回锚点时，会把远处模块先按捷径锚定，残差落到轴上对应边。**判断标准**：
- 主轴（无捷径）应 0 残差 → 这代表“可导入的干净几何”。
- 含捷径闭环时，残差出现在闭环捷径边（或由于锚定顺序移到轴上）→ FR-06 明确允许并应报告，这是工具表达能力限制，不是 bug。
- **死胡同支线（单连接不返锚点）天然 0 残差**：给隐藏房间/遗物室加一条 `drop` 等单边即可，不产生闭环。这是给魂系“可选探索”加内容的稳妥方式（示例见 ⑤ 隐修壁龛）。

## 5. 每次迭代必须报告的三类缺口（向用户）

**信息缺口**：参考作品/关卡、范围（单模块还是多模块区域）、玩法/功能清单、规范参数是否沿用 demo 值。
**内容缺口**：可直接复用的积木/墙体/地板模块库（当前 `data/levels` 为空，只有 `.gitkeep`）；`config/ue-parametric-blocks.json` 蓝图 Schema；UE `.uproject` 路径与 Blockout Tools 插件是否安装。
**工具缺口**：无 `ramp/floor/wall/spiral-stairs/elevator/road/pit` 积木类型；无实连 UE 的 Apply/回读（仅 dry-run）；无 `config/ue-parametric-blocks.json`。

## 6. UE 接入困难（如实列出）

1. 仅支持 box/doorway/stairs-linear 三种可部署 Actor；螺旋梯、坡道、电梯、路、坑在 UE 侧无对应积木，只能用 Box 近似。
2. 无实时 UE 连接（面板显示“未连接 UE”）；Apply/回读未实现。
3. `config/ue-parametric-blocks.json`（UE 实测蓝图 Schema）缺失，无法按官方参数构造。
4. Blueprint 类路径硬编码为 `/BlockoutToolsPlugin/Blueprints/...`，依赖目标项目已导入该插件。
5. 坐标/朝向换算已实现，但缺少 UE 真机核对，只能靠自动测试与数值推导验证。
6. **连接类型只支持固定单跳垂直差**（±300cm 等），魂系的“大落差捷径回环”无法零残差表达，必须接受并报告闭环残差。

## 7. 本 skill 待扩充清单（随迭代更新）

- [x] 建立“可直接复用的积木/墙体/地板模块库”与加载说明（先由参考关卡提炼，见 `scripts/` 生成器）。
- [x] 增加“图片/参考图转候选模块”流程（FR-11）——待实现。
- [ ] 填补 `config/ue-parametric-blocks.json` 蓝图 Schema（用户待提供）。
- [ ] 增加坡道/螺旋梯/电梯等积木类型或等效表达约定。
- [ ] 支持“多跳垂直”连接或 `long-drop`，以零残差表达大落差捷径回环。
- [x] 增加“多模块组合、端口连接求解与捷径回环的设计模板”（见 `docs/levels/sunken-sanctum-design.md`）。
- [x] 校验工具链：结构/规范/装配/UE dry-run（`validate-blockout.mjs`）+ Zod schema 严格复刻（`validate-schema.mjs`）+ UE Actor 计划导出（`export-ue-actors.mjs`）/UE Python 批量布景（`ue_unreal_spawn.py`）。
- [x] 用 app 真实域代码核对装配（`app-v2`: `npm run verify:level`；已验证与离线脚本结果一致）。
- [x] UE 落地说明/导入清单（`docs/UE_IMPORT_GUIDE.md`）。
- [ ] 浏览器/UE 真机核对（本沙盒因 esbuild `spawn EPERM` 无法跑 vite；需在用户机器打开 app 加载关卡并连 UE）。
