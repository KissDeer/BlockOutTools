import { describe, expect, it } from "vitest";
import { scopesOf } from "./concept";
import { canDeliver } from "./concept-validation";
import { createDemoProject } from "./demo-project";
import { flattenProjectGeometry } from "./node-geometry";
import { projectSchema } from "./project-schema";
import { validateProject } from "./validation";

/*
 * 示例项目是"新建项目"的起点，也是几乎所有测试的夹具（`createDemoProject()`）。
 * 它自己得先站得住：能过 schema、拓扑可交付、每个区域都有落位。
 * 这几条原来在 `domain.test.ts` 里，那份文件是围着模块与实例写的，已随模块层删除。
 */
describe("示例项目", () => {
  it("每次都是独立的一份，改一份不影响另一份", () => {
    const first = createDemoProject();
    const second = createDemoProject();
    first.concept!.nodes[0].blocks![0].name = "被改过";
    expect(second.concept!.nodes[0].blocks![0].name).toBe("主楼板");
  });

  it("过项目 schema，且逻辑拓扑可以交付", () => {
    const project = projectSchema.parse(createDemoProject());
    expect(project.name).toBe("洛斯里克城墙验证");
    expect(canDeliver(project.concept!).ok).toBe(true);
  });

  it("每个区域都写了落位，白盒规范检查干净", () => {
    const project = createDemoProject();
    const all = scopesOf(project.concept!).flatMap((scope) => scope.nodes);
    // 没写落位的节点会静默叠在原点，所以示例必须一个都没有
    expect(all.every((node) => node.relativePosition !== null)).toBe(true);
    expect(validateProject(project)).toEqual([]);
  });

  it("几何挂在节点上：展平出来的体块来自节点，锚点是世界原点", () => {
    const project = createDemoProject();
    const flat = flattenProjectGeometry(project);
    expect(flat.unplaced).toEqual([]);
    // 4 个根层节点里的三个有几何（密封暗室还没拼），加上子层的塔顶
    expect([...new Set(flat.blocks.map((placed) => placed.placementId))]).toHaveLength(4);
    // 有子层的节点（边塔）自己也有体块：几何与子逻辑并存
    const tower = project.concept!.nodes.find((node) => node.id === "lnode_demo_tower")!;
    expect(tower.childScopeId).toBe("scope_demo_tower");
    expect(flat.blocks.some((placed) => placed.placementId === tower.id)).toBe(true);
    // 边塔抬到 300cm：世界高度并进了积木的节点局部 Z，展平不再往父级借高度
    expect(flat.blocks.find((placed) => placed.block.id === "block_tower_floor")!.position[2]).toBe(300);
  });
});
