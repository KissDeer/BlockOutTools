import { describe, expect, it } from "vitest";
import { createEmptyTopology } from "./concept";
import { addLogicNode, createLogicModule } from "./concept-commands";
import { expandModule } from "./concept-scopes";
import { createBlock } from "./catalog";
import { buildLocalUEDryRun, buildNodeUEDryRun } from "./ue-plan";
import { buildDeploymentGeometry, buildNodeDeploymentGeometry } from "./deployment-geometry";
import { flattenNodeGeometry, flattenProjectGeometry } from "./node-geometry";
import { createDemoProject } from "./demo-project";
import type { BlockoutProject } from "./types";

/**
 * 一张图，三层：
 *
 *   大区（在根层，落位 [1000, 200]，朝向 90°）
 *     ├─ 自己的积木：一块 400×200×40 的楼板，放在它自己的 [0, 0]
 *     └─ 子层「大区 内部」
 *          └─ 小屋（落位 [200, 0]）
 *               └─ 一块 100×100×40 的楼板
 */
function nestedProject(): { project: BlockoutProject; outerId: string; houseId: string } {
  let topology = createEmptyTopology();
  const outer = addLogicNode(topology, [0, 0], { name: "大区", role: "hub", relativePosition: [1000, 200], relativeRotation: 90 });
  topology = outer.topology;
  topology = createLogicModule(topology, "大区", [outer.node.id]).topology;

  const expanded = expandModule(topology, outer.node.id, "大区 内部")!;
  topology = expanded.topology;

  let inner = createEmptyTopology();
  const house = addLogicNode(inner, [0, 0], { name: "小屋", role: "reward", relativePosition: [200, 0] });
  inner = house.topology;
  const { scopes: _pool, ...scope } = inner;
  topology.scopes = topology.scopes.map((item) => item.id === expanded.scope.id ? { ...item, nodes: scope.nodes } : item);

  const project = createDemoProject();
  project.modules = [];
  project.instances = [];
  project.connections = [];
  project.concept = topology;

  const floor = { ...createBlock("box", [0, 0, 0]), id: "floor_outer", name: "大区楼板" };
  const houseFloor = { ...createBlock("box", [0, 0, 0]), id: "floor_house", name: "小屋楼板" };
  project.concept.nodes = project.concept.nodes.map((node) => node.id === outer.node.id ? { ...node, blocks: [floor] } : node);
  project.concept.scopes = project.concept.scopes.map((scope) => scope.id === expanded.scope.id
    ? { ...scope, nodes: scope.nodes.map((node) => node.id === house.node.id ? { ...node, blocks: [houseFloor] } : node) }
    : scope);

  return { project, outerId: outer.node.id, houseId: house.node.id };
}

describe("节点几何展平", () => {
  it("沿层级累加每一级节点的 relativePosition，子层内容跟着父节点走", () => {
    const { project, houseId } = nestedProject();
    const flat = flattenProjectGeometry(project);
    expect(flat.blocks.map((placed) => placed.block.id)).toEqual(["floor_outer", "floor_house"]);

    const house = flat.blocks.find((placed) => placed.block.id === "floor_house")!;
    // 大区在世界 [1000,200]、转了 90°：小屋在它内部的 [200,0] 先转成 [0,200]，
    // 再加大区的世界原点 → [1000,400]
    expect(house.position[0]).toBeCloseTo(1000);
    expect(house.position[1]).toBeCloseTo(400);
    expect(house.namePath).toEqual(["大区", "小屋"]);
    expect(house.path).toEqual([flat.blocks[0].placementId, houseId]);
    expect(flat.unplaced).toEqual([]);
  });

  it("朝向沿层级累加，积木与子层一起转", () => {
    const { project } = nestedProject();
    const flat = flattenProjectGeometry(project);
    const outer = flat.blocks.find((placed) => placed.block.id === "floor_outer")!;
    expect(outer.rotation).toBe(90);

    // 大区转了 90°：小屋的局部 (200,0) 在大区自己那套坐标里落到 (0,200)，
    // 再加大区的世界原点 (1000,200) → (1000,400)
    const house = flat.blocks.find((placed) => placed.block.id === "floor_house")!;
    expect(house.position[0]).toBeCloseTo(1000);
    expect(house.position[1]).toBeCloseTo(400);
    expect(house.rotation).toBe(90);
  });

  it("画布排版坐标不参与任何几何计算", () => {
    const { project, outerId } = nestedProject();
    const before = flattenProjectGeometry(project).blocks.map((placed) => placed.position);
    const moved = {
      ...project,
      concept: {
        ...project.concept!,
        nodes: project.concept!.nodes.map((node) => node.id === outerId ? { ...node, graphPosition: [9999, 8888] as [number, number] } : node),
      },
    };
    expect(flattenProjectGeometry(moved).blocks.map((placed) => placed.position)).toEqual(before);
  });

  it("没有落位的区域会被点名，而不是静默叠在原点", () => {
    let topology = createEmptyTopology();
    const floor = { ...createBlock("box", [0, 0, 0]), id: "loose_a", name: "A 的楼板" };
    const other = { ...createBlock("box", [0, 0, 0]), id: "loose_b", name: "B 的楼板" };
    const first = addLogicNode(topology, [0, 0], { name: "未定 A", blocks: [floor] });
    topology = first.topology;
    const second = addLogicNode(topology, [300, 0], { name: "未定 B", blocks: [other] });
    topology = second.topology;
    const project = { ...createDemoProject(), modules: [], instances: [], connections: [], concept: topology };
    const flat = flattenProjectGeometry(project);
    expect(flat.unplaced).toEqual(["未定 A", "未定 B"]);
    // 两块都落在原点：展平如实反映，界面负责报出来
    expect(flat.blocks.map((placed) => placed.position.slice(0, 2))).toEqual([[0, 0], [0, 0]]);
  });

  it("只展平某个节点时，坐标相对这个节点自己", () => {
    const { project, outerId } = nestedProject();
    const local = flattenNodeGeometry(project, outerId);
    // 大区自己的楼板在它自己的原点
    expect(local.blocks.find((placed) => placed.block.id === "floor_outer")!.position.slice(0, 2)).toEqual([0, 0]);
    // 小屋在大区这套坐标里：大区自己的朝向也在这个坐标系里体现
    const house = local.blocks.find((placed) => placed.block.id === "floor_house")!;
    expect(house.position[0]).toBeCloseTo(0);
    expect(house.position[1]).toBeCloseTo(200);
  });
});

describe("3D 预览与 UE 导出吃同一份展平几何", () => {
  it("UE Actor 的位置来自节点落位，不再来自实例组装", () => {
    const { project } = nestedProject();
    const plan = buildLocalUEDryRun(project);
    expect(plan.actorCount).toBe(2);
    expect(plan.assemblyIssues).toEqual([]);
    expect(plan.unplaced).toEqual([]);

    const outer = plan.actors.find((actor) => actor.label.includes("大区楼板"))!;
    // 网页 X → UE X，网页 Y → UE -Y
    expect(outer.location[0]).toBe(1000);
    expect(outer.location[1]).toBe(-200);
    expect(outer.rotation[2]).toBe(-90);

    const house = plan.actors.find((actor) => actor.label.includes("小屋楼板"))!;
    expect(house.location[0]).toBe(1000);
    expect(house.location[1]).toBe(-400);
  });

  it("同步键用节点路径，改名不影响键", () => {
    const { project, outerId, houseId } = nestedProject();
    const keys = buildLocalUEDryRun(project).actors.map((actor) => actor.syncKey);
    expect(keys).toEqual([
      `${project.projectId}/${outerId}/floor_outer`,
      `${project.projectId}/${outerId}/${houseId}/floor_house`,
    ]);
    expect(buildLocalUEDryRun(project).actors.map((actor) => actor.syncKey)).toEqual(keys);
  });

  it("同一个项目的展平几何喂两边，位置一致", () => {
    const { project } = nestedProject();
    const primitives = buildDeploymentGeometry(project);
    const actors = buildLocalUEDryRun(project).actors;
    expect(primitives).toHaveLength(actors.length);
    for (const actor of actors) {
      const match = primitives.find((primitive) => primitive.syncKey === actor.syncKey)!;
      // 预览用网页坐标（Y 不取反），UE 计划里 Y 取反 —— 同一份世界坐标
      expect(actor.location[0]).toBe(match.position[0]);
      expect(actor.location[1]).toBe(-match.position[1]);
    }
  });

  it("节点局部预览只含这个节点自己与子层，不含它的父级落位", () => {
    const { project, outerId } = nestedProject();
    expect(buildNodeUEDryRun(project, outerId).actorCount).toBe(2);
    const local = buildNodeDeploymentGeometry(project, outerId);
    const outer = local.find((primitive) => primitive.syncKey.endsWith("floor_outer"))!;
    expect(outer.position[0]).toBe(0);
    expect(outer.position[1]).toBe(0);
  });
});

describe("旧项目仍走实例摆放", () => {
  it("没有拓扑的项目照旧按模块实例展平", () => {
    const project = createDemoProject();
    const flat = flattenProjectGeometry(project);
    expect(flat.blocks.length).toBeGreaterThan(0);
    expect(flat.placements.map((item) => item.id)).toEqual(project.instances.map((item) => item.id));
    expect(buildDeploymentGeometry(project).length).toBeGreaterThan(0);
  });

  it("有节点几何时不再按实例重复算一遍", () => {
    const { project } = nestedProject();
    // 故意塞一个实例进去：有节点几何的项目应该完全忽略它
    const withInstance = { ...project, instances: createDemoProject().instances, modules: createDemoProject().modules };
    const flat = flattenProjectGeometry(withInstance);
    expect(flat.blocks.map((placed) => placed.block.id)).toEqual(["floor_outer", "floor_house"]);
  });
});
