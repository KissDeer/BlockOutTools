# 洛斯里克高墙白盒

关卡：`/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2`

磁盘：`E:/Project/MYMY/Content/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2.umap`

本轮沿用幽邃教堂修订版的要求：根据原作参考重建可行走白盒，补建筑外形与氛围，不添加逻辑组件。[本轮实际查看的参考与范围](references/README.md)。

**已制作并保存**：5355个Actor（5338静态网格＋17环境/出生点），地图脏包为空。最终静态检查53316/53316通过；BP_Miya出生行走约8.8m和四类楼梯独立上行通过。编辑器停在关卡总览。

## 场景内容

- 起点高墙露台和左右分路，死路望塔、尸龙城垛、内墙下行、喷火飞龙平台及下层通道。
- 高墙边塔、屋顶路线、葛雷瑞特牢房支路、兵营与搜索侧室、羽翼骑士圆庭、通向起点的阶梯回环。
- 仪仗道与前场分流、舞娘教堂和后殿、玻尔多拱顶门庭、城外眺望出口。
- 厚城墙基座、垛口、檐带、拱门、圆塔与尖顶、坡屋顶、枯树、暗红旗帜、远景王城与巨型拱桥、向低处退落的屋顶街区。
- 双飞龙仅为静态轮廓，无行为。城底采用相连斜岩与裙房，远景塔楼补下贯支撑，避免悬空。
- 独立灰石/深色屋顶材质、低角度日光、黄灰天空、薄雾和室内局部灯；角色进入室内后有限自动适应曝光。

25条检查路线、13段楼梯；21个命名区域。几何与装饰按 `HWL/` 文件夹分组，编辑器保留单独可选的部件。

## 还原边界

本轮查看了高墙总览、两处篝火、飞龙近景和舞娘建筑背景，阅读区域流程。没有可校准尺度的完整地图：绝对比例、朝向和部分连接为白盒设计选择，不能称原版1:1测绘。

原作直梯与电梯使用开放可步行阶梯代理，捷径默认可通行；没有敌人、Boss、机关、篝火交互或门锁。外围城市与远景王城只作为场景背景，不属于完整可玩区域。

## 检查与报告

- `plan.json`：UE实际应用的合并清单，包括区域、路线、楼梯和假设。
- `application.json`：真实Actor创建/更新结果与场景边界。
- `environment.json`：材质实际参数读回、灯位、曝光和雾设置。
- `editor-validation.json`：最新编辑器Actor/材质/碰撞/归属检查，以及所有路线每50cm地面支撑和带步高余量的胶囊净空。
- `pie-playtest.json`：出生点正常移动，以及四类代表楼梯独立爬升。每段楼梯先将角色放到下层平台，之后靠移动输入上行；不是完整连续通关。
- `save-result.json`：地图保存成功、5355 Actor和无脏地图记录。
- `overview-final.png`、`rampart-final.png`、`dancer-final.png`：最终总览、城垛远望与教堂中轴截图。

不以离线几何检查代替PIE，不以短段PIE代替全部空间、跌落恢复或打包性能验证。

## 复现

1. 本地执行 `scripts/build_highwall_whitebox.py`、`scripts/build_highwall_scenery.py`，生成 `core-plan.json` 和 `scenery-plan.json`。
2. 在UE打开目标GPT2地图，停止PIE。用项目的 `Tools/Mechanisms/mcp_client.py --file ...` 依次执行 `setup_highwall_environment.py` 和 `apply_highwall_whitebox.py`。
3. 执行 `validate_highwall_whitebox.py`。启动PIE后执行 `playtest_highwall_whitebox.py`，等报告结束再停止PIE。
4. 检查视口并单独保存目标地图。生成与应用脚本不自动保存地图。

所有脚本都在BlockOutTools工作区的 `scripts/`。导入只创建/更新带 `HWL_Whitebox` 归属的稳定标签，不删除Actor；几何清单改名/移除须另外处理遗留件，不能假定重跑会删除。原空地图保存在 `backup/L_HighWallofLothric_Test_GPT2.before.umap`。

制作GPT2时没有修改前一张幽邃教堂或高墙Main关卡，没有修改BlockOutTools产品代码。地图与13个独立材质实例已提交到MYMY Content仓库 `0ed74bf`；本文、脚本与最终证据随BlockOutTools白盒提交入库，未推送。原空地图备份只留本地。
