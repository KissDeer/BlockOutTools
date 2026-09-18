# 幽邃教堂白盒：形态与氛围修订

关卡：`/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT`

磁盘：`E:/Project/MYMY/Content/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT.umap`

按用户第二轮要求，依据教堂外观、净身小教会、主教厅、罗莎莉亚房间四张原作截图，细化实际 UE 场景。参考来源和目视观察见 [references/README.md](references/README.md)。未加入游戏逻辑组件。

状态：已保存，共 2711 个 Actor（2693 个几何/标记，18 个环境/出生点），其中 28 个历史占位隐藏。最终静态检查 26285/26285 通过，本轮 PIE 行走约 7.8m 和四段楼梯独立爬升通过。PIE 后只替换了无碰撞的巨人装饰，并重新通过静态检查。

## 本轮场景内容

- 建筑：厚重分层立面、嵌套圆拱入口、真实窗洞、檐口、尖顶角塔、扶壁、完整板岩坡屋顶。屋顶单独分组，默认显示。
- 室内：柱基、连续拱廊、肋架、礼拜座椅、祭坛与棺椁、暗红布幔、静态烛台和吊灯。
- 外部：墓葬群、三座陵墓、二十四棵分叉枯树、残墙、石基础、台地与崖肩，承接原本孤立的平台。
- 氛围：灰褐石材、深灰板岩、低饱和地表、低角度暖灰天空、薄雾、十二组局部灯光。室内视角检查发现固定 EV10.5 过暗，改为 EV100 7.0–10.5 有界自动适应，保留窗光与暗部反差。

原有四层路线、两条回环、房梁和罗莎莉亚支路保留。旧悬浮标记和粗拱隐藏；没有删除历史 Actor。尺寸、朝向、空间连接及灯光数值是白盒设计选择，未经原作测绘，不是 1:1 重建。

## 验证证据

- `editor-validation.json`：最新编辑器检查，包含 Actor、材质、碰撞状态及十四条路线的 3715 个地面/胶囊采样；不等同完整角色通关。
- `pie-movement.json`：本轮 BP_Miya 从出生点靠正常输入行走的记录。
- `pie-stairs.json`：本轮四段楼梯独立爬升记录；每段先传送到下层平台，爬升本身使用正常移动输入。
- `refined-application.json` 与 `atmosphere-v2.json`：实际编辑器应用结果。
- `v2-exterior-final.png` / `v2-nave-final.png`：最终外部与室内观察图。

未验证完整连续通关、全部掉落恢复、打包运行或大规模性能。本轮不包含敌人、交互或战斗制作。

## 调整与复现

现有场景使用稳定 `COTD_` 标签和 `COTD/` 文件夹组织，仅更新有归属标记的 Actor。以下按顺序执行：

1. 本地运行 `scripts/refine_cathedral_architecture.py` 和 `scripts/refine_cathedral_grounds.py`，生成两份细化清单。
2. 在目标地图的 UE Python 中运行 `scripts/refine_cathedral_atmosphere.py`，创建/更新独立材质实例和原生灯光/雾。
3. 运行 `scripts/apply_cathedral_refinement.py`，将 `v1-backup/plan.json` 与两份细化清单合并并落到编辑器；成功后更新 `plan.json`。
4. 运行 `scripts/validate_cathedral_whitebox.py`。启动 PIE 后依次运行两个 `scripts/playtest_cathedral_*.py`，待报告完成再停止 PIE。
5. 检查视口后单独保存目标地图。上述脚本不会自动保存地图。

不要只运行旧版 `build_cathedral_whitebox.py` / `setup_cathedral_environment.py` 后保存，它们会恢复首版数据或曝光；它们仅用于首版重建，之后仍需完整执行本轮细化。

`v1-backup/` 保留第一版关卡/清单；`L_HighWallofLothric_Test_GPT.before.umap` 是更早的空关卡备份。二进制备份只留本地，生成所需第一版清单已入库。地图与13个独立材质实例已提交到MYMY Content仓库 `0ed74bf`；本文、脚本与最终证据随BlockOutTools白盒提交入库。未推送，其他关卡原有改动保留。
