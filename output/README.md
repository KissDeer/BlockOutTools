# UE 白盒交付

| 白盒 | 交付说明 | UE 地图 |
|---|---|---|
| 幽邃教堂 | [内容与复现](cathedral-of-the-deep/README.md) | `L_HighWallofLothric_Test_GPT` |
| 洛斯里克高墙 | [内容与复现](high-wall-of-lothric/README.md) | `L_HighWallofLothric_Test_GPT2` |

本仓库保存生成脚本、最终几何清单、验证报告、最终截图与已使用的参考图片/来源。UE 地图与独立材质实例保存在 `E:/Project/MYMY/Content` 的独立 Git/LFS 仓库，不能只提交本仓库就认为地图已经入库。

本次配套Content提交：`0ed74bf9a08e6624ba07443f40214a94282d7964`（2张地图、26个材质实例）。本轮只做本地Git提交，没有推送。

原始网页、搜索缓存、调试截图和二进制地图备份通过本目录 `.gitignore` 留在本地，没有删除。幽邃教堂的 `v1-backup/plan.json` 是修订版生成输入，仍然纳入版本管理；空地图与旧地图二进制备份只用于本机恢复，不是其他机器复现的前置条件。

现有记录中的绝对路径与Actor对象路径是制作机器的执行证据。换工作区时需调整脚本路径；它们不代表跨机器自动部署。完整连续通关和打包性能不在本轮验证范围。
