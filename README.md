# BlockOutTools V2

面向 UE 白盒制作的本地桌面网页工具。启动时进入模块关系画布，双击模块编辑内部积木，通过内部出入口连接模块，手动刷新三维预览。

## 启动

需要 Node.js 20+。首次在 `app-v2` 运行 `npm install`，以后双击根目录 `Start-BlockOutTools-V2.cmd`。地址为 http://127.0.0.1:4174/ 。保持服务窗口打开。

## 保存与 Git

顶栏“保存到磁盘”或 Ctrl+S 首次保存当前项目；随后编辑自动保存。“本地项目库”选择其他文件、读取磁盘并合并。浏览器草稿是恢复副本，顶栏分别显示草稿与磁盘状态。

需要建立另一个关卡文件，使用库内“另存为独立项目”；普通改名只更新当前项目名称。

默认目录为 `data/projects-v2/project-<项目身份摘要>/`，其中 `project.blockout.json` 是项目清单，`modules/` 保存模块文件。模块文件按内容命名，未修改模块不会重复写入；清单最后原子替换。旧模块版本保留用于恢复，不要手动清理。正式项目可整体进入 Git。个人目录用环境变量 `BLOCKOUT_V2_DATA_DIR` 指定。

磁盘有其他页面或 Git 修改时停止自动保存。点击“读取磁盘并合并”可合并不同字段；同字段冲突显示路径并保留数据，先导出草稿再用 Git 解决。当前没有图形化逐字段冲突选择器。

`data/levels/` 仍保留旧版共享数据，继续跟踪；V2 不会把这些旧文件当成当前 V2 草稿。

## 空间制作

- Box 可标记楼板、落脚平台、墙壁和包边。选择“行走表面 Z”后厚度向下延伸；切换基准保持实体位置不动。
- 直梯检查器的“按上下落脚点计算楼梯”根据两端位置与高度求解。空间不足直接报告，不移动平台或拉长楼梯。
- 选择连线编辑向前间距、横向偏移和终点相对高差；单向通行与高低方向分开。自定义距离在切换类型时保留。
- 实例可设为组装基准；连线只影响拼装，不生成门、楼梯、电梯实体。
- “规范检查”配置尺度并定位问题。3D 支持模块隔离、端口方向和高度剖切。约束闭合不代表全路线可走。

## 从图纸生成

进入模块，“图纸底图”导入 PNG/JPG/WebP，填写已知线段的像素和真实长度校准，设置原点、角度、透明度和图例。可直接对照底图编辑。

导出“解释文件 / 模板”，填写稳定特征 ID、楼板轮廓、墙段、楼梯落脚点与端口，重新读取后逐模块接受。详见 [图纸输入契约](docs/rebuild/DIAGRAM_INPUT.md)。SVG/DXF/PDF 当前先转换成底图，未实现自动 OCR 或任意 CAD 解析。

离线候选生成使用 `node scripts/generate-diagram-project.mjs 基础项目.blockout.json 解释.json 新候选.blockout.json`，与页面使用同一领域生成器。不会覆盖输入或已有输出。

旧 `scripts/generate-lothric-v2-project.mjs` 是历史手工推断样例脚本，发现不合理楼梯时现在会拒绝输出，不再拉长凑尺寸。已有 `layouts/lothric-high-wall-v2.blockout.json` 保留用于回归，不代表真实可走性已验收。

## 验证与边界

在 `app-v2` 运行 `npm test`、`npm run check`、`npm run build`、`npm run verify:level`。网页变更另做桌面浏览器验证，不维护手机端。

“UE 计划”仍是本地 dry-run，不连接 MCP、不写 UE。CLOSED/SLOPED 楼梯缺少插件实测依据，预览标记为 BOX 近似；不得当成已确认的 UE 几何。实际 UE 导入和回读另行执行。

需求见 [docs/rebuild](docs/rebuild/README.md)，工具 Skill 见 [skills/layout-tools-workflow](skills/layout-tools-workflow/SKILL.md)。旧宿主代码已从当前工作目录移除，历史行为通过 Git 查阅。
