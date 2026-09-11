# 积木规则库

<!-- 由 scripts/generate-block-library-index.mjs 生成，请修改对应 definition.json。 -->

先读 [通用规则](common-rules.md)，再按类型读取 definition.json、usage.md 和需要的 examples。目录中的定义只有经 catalog.ts 注册并实现后才可在网页使用。

| 积木与用法 | 固定类型 ID | 规则版本 | 用法确认 | 网页预览 | UE 验证 |
|---|---|---|---|---|---|
| [Box 盒体](box/usage.md) | box | 1 | 用户已确认：墙壁与地面均使用 Box | 网页矩形盒体 | 待实测 |
| [Doorway 门洞](doorway/usage.md) | doorway | 1 | 沿用当前实现，待逐项确认 | 两侧立柱与顶部盒体 | 待实测 |
| [模块出入口](port/usage.md) | port | 1 | 按模块内部位置与朝向连接 | 方向箭头 | 不部署 |
| [Stairs Linear 线性楼梯](stairs-linear/usage.md) | stairs-linear | 1 | 沿用当前实现，待逐项确认 | BOX 台阶；CLOSED/SLOPED 仅近似 | 待实测 |
