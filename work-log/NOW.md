# 现在到哪儿了

> 每次开工先读这一页。每次收工前更新它。
> 设计决策与理由在 `design-log/`，这里只记进度。

**更新：2026-09-17（第二次）**

---

## 上次做到哪

| 日期 | 做了什么 | 提交 |
|---|---|---|
| 09-17 | **删掉退役的构型领域件 + 模块→实例生成器**（S2-1 过半） | 本次 |
| 09-17 | 工作记录机制建立 | `edeaddd` |
| 09-17 | 删掉 4 个退役面板（拆解/构型的 Board 与 Inspector） | `25e3b8e` |
| 09-17 | 一张画布 + 层级导航：取消两个顶层页签，进入节点 = 换焦点 | `639a8ea` |
| 09-17 | 左侧栏合并：层级树成为区域清单的唯一出口 | `c2c4404` |
| 09-17 | 删掉旧项目库（两个项目，35 个文件） | `968ca7a` |
| 09-17 | 草案采用代价试算 + 同名资料去重 | `5b3820d` |

## 接下来干什么

**主线：削掉模块层（第二步）**。方案与实测分析在
[design-log/2026-09-17-削掉模块层与合并画布.md](../design-log/2026-09-17-削掉模块层与合并画布.md)。

按"**每次都能编译**"的顺序，一次做一小步：

- [x] **S2-1a** 删 `concept-configuration`（退役的构型：候选/生成/校验）+ 它的测试
- [x] **S2-1b** 删 `concept-assembly`（模块 → 实例的生成器）+ 它的测试
- [x] **S2-1c** `ROLE_TEMPLATES` 挪到 `role-templates.ts`；删 `commands.applyConfiguration`、store 的构型/组装状态、`/api/concept/configuration` 三个端点
- [ ] **S2-1d** 删 `module-preview-project`（模块局部 3D 预览），把 `PreviewPanel` 改成看整体或看节点
- [ ] **S2-2** 改 B 堆的读取点（store → 显示层），一处一处来
- [ ] **S2-3** 动 `DecompositionCanvas`（成组界面把模块框当画布节点画，最麻烦）
- [ ] **S2-4** 删 `concept-decomposition` / `commands.ts` 的 ModuleDefinition，同时给 `LogicNode` 加 `blocks` / `childScopeId`，删 `LogicModule`
- [ ] **S2-5** UE 导出改吃节点几何（标签名不变，值换成路径限定的节点放置 id）
- [ ] **S2-6** 清 `instances` / `connections` / 磁盘分文件格式 / 素材 `moduleIds` / 草案 `moduleId`

之后：`AssemblyCanvas` 的去向（用户说一会儿再说）。

## 当前状态

- 类型：干净（`npx tsc -b` 0 错误）
- 测试：**184 通过 / 24 文件**（原 213/26，降下来是删了构型与组装的测试）
- 工作树：干净
- 远端：见提交后同步

## 别忘的坑

- **改文件前先停 dev server**，Vite 监听会锁文件（EBUSY）
- **大重构不要一口气改**：前两次削模块都因为"改到一半发现预算不够"整轮回退。按上面 S2-x 走，每步都能跑测试
- **删文件前查全仓库**，不只看 UI 层。上次删退役面板时连背后的领域件一起删了，结果画布编译不过——成组界面还在用
- **删「退役功能」时先分清边界**：面板组件是死的，但面板背后的领域件可能还被别处（成组界面、模块草案）在用。这次构型能安全删，是因为查过引用只在 store 和测试里
- 新增领域文件要加进 `app-v2/tsconfig.node.json` 的 `include`，否则报 TS6307
- 用 .NET `File.ReadAllLines`/`WriteAllLines` 做批量行列编辑（`Set-Content -Encoding UTF8` 会毁掉中文）

