# V2 代码复查：旧问题对照与新问题

复查日期：2026-09-01
复查范围：`app-v2/`（2873 行 TS/TSX，全新重写）+ 仓库现状（V1 仍在）
基线验证：`app-v2` 的 `npm run check`（tsc -b）通过、`npm test` 13 项通过、`npm run build` 生产构建通过。

## 0. 结论摘要

V2 不是 V1 的重构，而是**旁路的全新重写**（`REBUILD_PLAN.md` 的"旁路重做"策略）。因此旧问题的状态分三类：

- **架构性消失（5 条）**：失败模式在新结构下不可能发生，不需要修。
- **原样保留（4 条）**：问题仍在 V1 代码里，而 V1 仍是 README 教用户启动的版本。
- **没修，但也不是 V2 的范围（2 条）**：UE MCP、拼写错误，被推到 Phase 1/3。

同时 V2 引入了 **13 条新问题**，其中 4 条是 P1。最需要关注的两条：

1. **草稿加载失败会静默回退到示例工程**（`persistence.ts:10` + `project-store.ts:72`）——用户的工作会不翼而飞且无任何提示。
2. **3D 预览一物一材质**——NFR-01 要求 10,000 个部署几何，当前实现做不到。

---

## 1. V1 旧问题逐条对照

### 1.1 架构性消失 ✅

| # | 旧问题 | 新状态 | 依据 |
|---|---|---|---|
| ① | **P0 模块内部编辑静默损坏关卡** | V2 中不可能发生 | `project-store.ts:108` 的 `openModule` 只做 `set({ view, activeInstanceId, ... })`。没有图层可见性改写、没有 `setLevel`、没有独立的自动保存订阅。持久化唯一入口是 `commit()`，"隔离态被写盘"这条路径在结构上不存在。 |
| ④ | **P1 组装画布每帧全量重建 SVG** | 已解决 | 改用 React Flow 管理节点，拖拽只在 `onNodeDragStop` 提交一次（`AssemblyCanvas.tsx:85`）。模块缩略图用 `createModulePreviewModel` 一次性算 bounds，不再每帧遍历全部 shapes。 |
| ⑥ | **P1 check 脚本手工清单漏文件** | V2 已解决 | `check` = `tsc -b`，真类型检查，不存在清单维护问题。 |
| ② | **P0 关卡写入非原子** | V2 中不适用 | V2 改用 localStorage，无文件写入。但见 1.2。 |

### 1.2 原样保留在 V1 ⚠️

V1 代码（`src/`、`vendor/`、`scripts/serve.mjs`）**仍在仓库且仍是 `Start-LayoutTools.cmd` 启动的版本**，`README.md` 正文仍在教用户使用本地关卡库、UE 桥接和 AI 积木。因此：

| # | 旧问题 | 现状 |
|---|---|---|
| ① | 模块内部编辑损坏关卡 | **V1 用户仍会踩**。`src/integrations/layout/structure-module-panel.js` 未改动。 |
| ② | 非原子写入 `autosave.json` | **未修**。`src/server/local-level-library.js` 无 tmp+rename、无 .bak。 |
| ⑥ | check 脚本漏文件 | **仍漏 10 个**：`src/runtime/vendor-bridge.mjs`、`scripts/build-keepsake-connections.mjs`、`scripts/render-design-svg.mjs`，以及 6 个测试文件（`ai-block-bridge`、`block-library`、`export-dimension-labels`、`local-level-library`、`static-host`、`ue-bridge-converter`、`vendor-bridge`）。51 个 js/mjs 中覆盖 41 个。 |
| ⑩ | 仓库卫生 | **部分改善**。`.gitignore` 已提交并补上 `app-v2/dist/`、`*.tsbuildinfo`。但仍未处理：`.analysis/`（25MB，含两个 chrome-profile）和 `.workbuddy/` 未跟踪也未忽略；5 个未跟踪文件（`docs/CODE_REVIEW.md`、`keepsake-design-blueprint.png`、`layouts/keepsake-connected-layout.json`、`scripts/build-keepsake-connections.mjs`、`scripts/render-design-svg.mjs`）；根目录与 `.analysis/` 各有一份 186KB 同名 png。 |

### 1.3 以功能退换掉 bug 🔄

| # | 旧问题 | 现状 |
|---|---|---|
| ③ | **P0 UE MCP 会话失效后卡死** | **bug 消失，功能也没了**。V2 中 MCP 客户端根本不存在。`UEDryRunPanel.tsx:15` 明示"本地 dry-run · 未连接 UE"。`REBUILD_PLAN.md` 把 UE Apply 排在 Phase 3。属于正常的分期取舍，但要明确：**当前 V2 无法连通 UE**。 |
| ⑨ | **拼写错误 `SectionLenght` / `SkewboxLenght`** | **仍未确认**。V2 的 `catalog.ts` 只有 4 种类型，参数名是 `BoxSize` / `DoorwaySize` / `StairsSize`，不含 Length 系列。问题随"完整参数化目录"顺延到 Phase 1。`config/ue-parametric-blocks.json` 和 V1 的 `block-catalog.js` 仍在仓库，待办有效。 |

### 1.4 两个版本共同的问题

| # | 旧问题 | 现状 |
|---|---|---|
| ⑦ | **零静态检查** | **两版都没有**。V2 有明确的 NFR-05 可维护性要求，却没有工具守着。具体后果见 2.7。 |
| ⑧ | **前端零覆盖** | **V2 部分改善但不足**。13 个测试全部是纯函数层（domain 8 / store 2 / preview-model 3）。没有组件测试（jsdom、React Testing Library 均未安装），没有 E2E。`REBUILD_PLAN.md` 第 2 节自己写了"Playwright 覆盖真实桌面流程"，但 `app-v2` 里既无 Playwright 也无 e2e 目录——README 声称的"1280x720 真实浏览器回归通过"没有落到可复现的测试资产。 |

### 1.5 恶化的问题 ❌

| # | 旧问题 | 现状 |
|---|---|---|
| ⑤a | 3D 每个形状独立材质 | **更严重**，见 2.3。 |
| ⑤b | 3D 丢弃 `connection.waypoints` | **更彻底**，见 2.4。V1 至少 2D 里折点还在，V2 是数据能进来、所有视图全丢。 |

---

## 2. V2 新问题

### 2.1 [P1] 草稿加载失败 = 静默回退到示例工程

`app-v2/src/domain/persistence.ts:10-14`

```ts
const parsed = projectSchema.safeParse(JSON.parse(raw));
return parsed.success ? parsed.data : null;   // 校验失败 → null
```

`app-v2/src/store/project-store.ts:72`

```ts
const initialProject = loadDraft() ?? createDemoProject();
```

任何一次 schema 变更、坏文件、或 Phase 1 加字段，都会让用户打开页面时**看到示例工程，自己的工作不翼而飞，没有任何提示**。

NFR-02 明确要求"自动恢复草稿与正式项目分离；恢复前显示时间、项目和差异摘要"，当前实现正好相反：不分离、不显示、静默替换。

当前 UI 路径很难产生非法值（`NumberField` 有 `min`，`BlockNode.resizedBlock` 有 `Math.max` 保护），所以是**潜伏型**风险——也正因如此，最容易在 Phase 1 改 schema 时突然炸掉一批用户的草稿。

**建议**：`loadDraft` 区分"无草稿"和"草稿损坏"两种返回；损坏时保留原始字符串到另一个 key，启动时弹窗告知"检测到无法解析的草稿（时间 X），已隔离，是否导出原始内容"，再决定是否回退。

### 2.2 [P1] localStorage 容量上限没有兜底

`persistence.ts:18` 直接 `JSON.stringify` 整个工程写入 localStorage（约 5MB 硬上限）。

- Lothric 样例已 279KB。
- NFR-01 基线是 100 模块实例 × 每模块 500 积木——JSON 轻松超过 5MB。
- 超限时 `setItem` 抛异常，`scheduleSave` 只把状态标成"保存失败"（`project-store.ts:66`）。**没有降级、没有引导用户导出为文件**，而且之后每次编辑都重复失败。
- NFR-01 要求"5MB 项目增量保存 1 秒内完成，保存不阻塞画布输入"。当前是每次 `commit` 全量 `JSON.stringify` + 同步写，debounce 仅 350ms。

**建议**：（a）保存前估算体积，超过阈值时提示"草稿过大，请改用项目文件保存"；（b）Phase 1 引入 `server/` 后用文件 + 原子替换承接大工程，localStorage 只做崩溃恢复的短草稿。

### 2.3 [P1] 3D 预览一物一材质，达不到 NFR-01

`app-v2/src/features/preview/PreviewPanel.tsx:47-60`

```ts
for (const primitive of primitives) {
  const geometry = new THREE.BoxGeometry(...);
  const material = new THREE.MeshStandardMaterial({...});   // 每个 primitive 一份
  const mesh = new THREE.Mesh(geometry, material);
  ...
  if (primitive.size[2] > 60 && ...) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), ...);
  }
}
```

实测规模（Lothric V2 样例）：
- 383 个积木 → **701 个部署几何**（含 322 级台阶展开）
- 即 701 个 mesh + 701 个材质 + 最多 701 个 `EdgesGeometry`

NFR-01 的目标是 **10,000 个部署几何 / 3 秒刷新 / 30 FPS**。10,000 次独立 draw call 达不到这个指标，台阶展开尤其容易爆（`NumberOfSteps` 上限 1000，一个楼梯就是 1000 个 mesh）。

**建议**：按 (颜色, 尺寸) 缓存共享材质；同尺寸的 box 用 `InstancedMesh`；`EdgesGeometry` 改为共享一份单位立方体的边线几何 + 变换矩阵。台阶在超过阈值时降级为单个楔形几何。

### 2.4 [P1] `waypoints` 是死字段——V1 的折点数据进入 V2 后全部丢失

`Connection.waypoints: Vec2[]` 在 `types.ts:92` 和 `project-schema.ts:43` 里定义，`addConnection` 写入 `waypoints: []`（`commands.ts:112`）。

实测：`layouts/lothric-high-wall-v2.blockout.json` 的 **13 条连接全部带折点**。但全仓 grep `waypoints`，除定义与写入外**没有任何读取点**：

- 2D 组装画布：`AssemblyCanvas.tsx:53-65` 用 `type: "smoothstep"` 自动布线，不读 waypoints。
- 3D 预览：不画连接，只画积木几何。

也就是说，V1 里用户精心加的路线折点，在 V2 中数据能进文件、视图全丢。这是 V1 问题 ⑤b 的彻底版。

`REBUILD_PLAN.md` Phase 2 列了"连接折线"，所以是已知待办——但字段已经进了 schema 且被生成器填充，容易让人误以为已经支持。

**建议**：二选一——Phase 2 实现折点编辑与渲染；或暂时从 schema 中移除该字段、并在生成器里不再填充，避免"数据存在但无效"的假象。

### 2.5 [P1] UE 计划面板每次渲染全量重算 + 渲染全部 actor

`app-v2/src/features/ue/UEDryRunPanel.tsx:7-8`

```ts
const project = useProjectStore((state) => state.project);
const plan = buildLocalUEDryRun(project);   // 无 useMemo，每次渲染重算
```

`buildLocalUEDryRun` 内部调用 `resolveAssembly`（BFS 遍历全部连接）+ 全量展开 actor。Lothric 下得到 **357 个 actor**，面板把它们全部渲染成 `<article>` DOM 节点，且**无虚拟滚动**。

打开 UE 计划面板 = 一次完整装配求解 + 357 个 DOM 节点，且任何一次无关的状态变化（`saveStatus`、选中变化等）都会触发重算。

**建议**：`useMemo` 按 `project` 缓存；列表虚拟化或折叠为按模块分组的摘要 + 展开。

同类问题（`validateProject` 在 `IssueIndicator.tsx:7` 每次渲染执行，遍历 383 个积木）量级较轻，但同样建议 memo。

### 2.6 [P2] 4 个 profile 字段是死契约

`blockoutProfile` 中 `enforceUeImport`、`capsuleRadius`、`capsuleHalfHeight`、`maxStepHeight` 在 schema 里**必填**（`project-schema.ts:47-50`），但全仓没有任何读取点。`validateProject` 只消费 `enabled`、`minDoorWidth`、`minDoorHeight`、`maxStairRise`、`minStairTread`。

副作用：每个工程文件都被迫携带 4 个无语义字段；而且默认值已经不一致——`demo-project.ts:99` 是 `enforceUeImport: true`，`generate-lothric-v2-project.mjs` 产出的样例是 `false`。

**建议**：Phase 1 实现这些检查（胶囊体通过性、最大踏步高度、导入守卫），或把它们从必填 schema 中降级为可选，避免占着字段却没有实现。

### 2.7 [P2] 无 ESLint / Prettier，已有两处可被工具直接捕获的隐患

V2 有 NFR-05 可维护性要求，但 `devDependencies` 里只有 typescript / vite / vitest / 类型包。两处具体后果：

- `PreviewPanel.tsx:118` 的 `useEffect` 依赖数组是 `[revision]`，但 effect 体内读了 `project`。逻辑上依赖 `previewRevision` 的手动刷新（属于有意设计），但没有注释说明，`exhaustive-deps` 规则会告警，后来的维护者极易"顺手修正"成 `[project]` 从而破坏手动刷新语义。
- `BlockInspector.tsx:37` 用 `structuredClone(block!)` 非空断言绕过类型保护；此处 `block` 已在第 30 行判空，可以直接改成参数传入。

**建议**：装 ESLint（typescript-eslint + react-hooks）+ Prettier，两条两小时内能完成。

### 2.8 [P2] 350ms 防抖保存没有落盘兜底

`scheduleSave` 的 timer（`project-store.ts:56-69`）不在 `pagehide` / `visibilitychange` 时 flush。最后一次编辑后 350ms 内刷新或关闭标签页 → 丢失。窗口太小以至于不易察觉，但配合 2.2 的保存失败一起看，会放大成"我明明在编辑，为什么没了"。

**建议**：监听 `pagehide`，同步执行 `saveDraft`。

### 2.9 [P2] 无 ErrorBoundary

V2 没有任何错误边界。Konva / React Flow / Three.js 任一抛错 → 整页白屏，而 localStorage 里可能还有未落盘的编辑。

### 2.10 [P2] 导入文件无大小上限

`ProjectFileActions.tsx:26` 直接 `await file.text()`，无大小检查。NFR-04 明确要求"所有 JSON、AI 命令和 UE 回读先做大小限制和 Schema 校验"——当前只有 Schema 校验，且发生在整份内容已经进内存之后。拖一个 2GB 的 json 进去就是 OOM。

**建议**：先读 `file.size`，超过阈值（如 100MB）直接拒绝并提示。

### 2.11 [P2] 测试跨目录引用，破坏 app-v2 的独立性

`app-v2/src/domain/domain.test.ts:2`

```ts
import lothricProject from "../../../layouts/lothric-high-wall-v2.blockout.json";
```

`REBUILD_PLAN.md` 第 3 节要求 app-v2 是独立工程，这条引用让它搬不出去。

**建议**：把样例 JSON 复制到 `app-v2/src/domain/__fixtures__/`，由脚本生成时同步写入。

### 2.12 [P2] 双工程没有统一入口

根目录 `npm run check` / `npm test` 只管 V1，完全不知道 `app-v2` 的存在；要跑 V2 必须 `cd app-v2`。

而且 `.gitignore` 忽略了 `app-v2/node_modules`——上次已经因此踩过一次"启动报 Dependencies are not installed"（见 `.workbuddy/memory/2026-09-01.md`）。切分支或清理时容易再次丢失。

**建议**：根目录加 `check:all` / `test:all` 聚合脚本；README 顶部把 V2 作为默认路径、V1 降级为 Legacy 小节。

### 2.13 [P2] 3D 预览首次展开是空面板

`previewRevision` 初值为 0，`PreviewPanel.tsx:26` 的 `if (!host || revision === 0) return` 直接跳过渲染。用户点"3D 预览"后看到的是"3D 尚未生成"，必须再点一次"刷新"才有内容。顶栏 dirty 小圆点和状态栏"3D 需要刷新"能提示，但首屏体验反直觉。

**建议**：`togglePreview` 时若 `revision === 0` 则自动触发一次 `refreshPreview`。

### 2.14 [P3] 交互细节

- 不支持 `Ctrl+Y`（只有 `Ctrl+Shift+Z`，`App.tsx:55`）。
- `Backspace` 在画布上直接删除实例/积木且无确认（`App.tsx:73-77`）。有撤销可回，但没有确认提示。

---

## 3. 建议处理顺序

**第一批（数据安全，建议在 Phase 1 动 schema 之前完成）**
1. 2.1 草稿损坏静默回退 —— 加隔离与提示
2. 2.2 localStorage 容量兜底 —— 超限提示 + 引导导出
3. 2.8 `pagehide` flush
4. 2.9 ErrorBoundary

**第二批（工程化，两小时内可完成）**
5. 2.7 ESLint + Prettier
6. 2.12 根目录聚合脚本 + README 重排
7. 2.10 导入大小上限
8. 2.11 测试 fixture 内移

**第三批（性能，配合 NFR-01 实测）**
9. 2.3 3D 材质缓存 / 实例化
10. 2.5 UE 面板 memo + 虚拟化
11. 建立 NFR-01 的性能基线测量脚本（100 实例 × 500 积木 × 200 连接）

**第四批（契约清理，与 Phase 1/2 一起做）**
12. 2.4 waypoints：实现或移除
13. 2.6 profile 死字段：实现或降级为可选
14. 1.3 拼写错误 `SectionLenght` / `SkewboxLenght` 确认

**关于 V1**：如果 V1 计划在 Phase 5 归档，建议现在就把 README 的用户引导切到 V2，并至少修掉 ①（模块编辑损坏关卡）。它是唯一一条会在正常操作流程中损坏用户数据、且用户自己无法定位原因的问题。
