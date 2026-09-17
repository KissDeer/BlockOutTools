import { describe, expect, it } from "vitest";
import { createBlock } from "./catalog";
import { createEmptyTopology } from "./concept";
import { addLogicNode } from "./concept-commands";
import { expandNodeScope, scopeView, writeScopeView } from "./concept-scopes";
import { createDemoProject } from "./demo-project";
import { validateProject } from "./validation";
import type { Block, BlockoutProject, BoxBlock, DoorwayBlock, PortBlock, StairsLinearBlock } from "./types";

/*
 * 规范检查的单位是**节点**：积木挂在节点上，坐标是节点局部厘米。
 * 这几条断言原来散在 `domain.test.ts` 与 `spatial-workflow.test.ts` 里，
 * 那两份夹具是围着"模块 + 实例"写的，随模块层一起删了；
 * 规则本身（门洞、楼梯坡度、落脚支撑与净空、未确认尺寸）一条都没少，所以在这里按节点重写。
 */

function door(id: string, width: number, height: number): DoorwayBlock {
  const block = createBlock("doorway") as DoorwayBlock;
  return { ...block, id, name: id, parameters: { ...block.parameters, DoorwaySize: [40, width, height] } };
}

function stairs(id: string, steps: number, size: [number, number, number] = [180, 360, 180], position: [number, number, number] = [0, 0, 40], type: StairsLinearBlock["parameters"]["StairsType"] = "BOX"): StairsLinearBlock {
  const block = createBlock("stairs-linear", position) as StairsLinearBlock;
  return { ...block, id, name: id, parameters: { ...block.parameters, StairsSize: size, NumberOfSteps: steps, StairsType: type } };
}

function floor(id: string, size: [number, number, number] = [400, 400, 40]): BoxBlock {
  const block = createBlock("box", [0, 0, 40]) as BoxBlock;
  return { ...block, id, name: id, role: "floor", elevationReference: "surface", parameters: { ...block.parameters, BoxSize: size } };
}

function box(id: string, position: [number, number, number], size: [number, number, number]): BoxBlock {
  const block = createBlock("box", position) as BoxBlock;
  return { ...block, id, name: id, parameters: { ...block.parameters, BoxSize: size } };
}

function port(id: string, position: [number, number, number], width = 140): PortBlock {
  const block = createBlock("port", position) as PortBlock;
  return { ...block, id, name: id, parameters: { ...block.parameters, width } };
}

/** 一个只含一个节点的项目：检查的单位就是节点，所以夹具也只搭一个节点 */
function withNode(blocks: Block[]): BlockoutProject {
  const project = createDemoProject();
  project.concept = addLogicNode(createEmptyTopology(), [0, 0], { name: "测试区域", blocks }).topology;
  return project;
}

describe("白盒规范检查", () => {
  it("门洞尺寸按节点与积木点名，值取自节点自己的积木", () => {
    const project = withNode([door("door_narrow", 80, 180)]);
    const issues = validateProject(project);
    expect(issues.map((issue) => issue.rule)).toEqual(["DOOR_MIN_WIDTH", "DOOR_MIN_HEIGHT"]);
    // 同一条积木身份：问题指向的 nodeId / blockId 能直接拿来选中
    expect(issues.every((issue) => issue.blockId === "door_narrow")).toBe(true);
    expect(issues.every((issue) => issue.nodeId === project.concept!.nodes[0].id)).toBe(true);
    expect(issues.every((issue) => issue.id === "door_narrow:door-width" || issue.id === "door_narrow:door-height")).toBe(true);
  });

  it("楼梯踢面与踏步各自成条，踢面按级数摊", () => {
    // 高 260 / 8 级 = 32.5cm 踢面；进深 180 / 8 级 = 22.5cm 踏步
    const project = withNode([stairs("stair_bad", 8, [180, 180, 260])]);
    const issues = validateProject(project);
    expect(issues.map((issue) => issue.rule)).toEqual(expect.arrayContaining(["STAIR_MAX_RISE", "STAIR_MIN_TREAD"]));
    expect(issues.every((issue) => issue.blockId === "stair_bad")).toBe(true);
    expect(issues.find((issue) => issue.rule === "STAIR_MAX_RISE")?.message).toContain("32.5cm");
  });

  it("非 BOX 楼梯只给警告：UE 形态还没核实", () => {
    const project = withNode([stairs("stair_closed", 20, [180, 560, 360], [0, 0, 40], "CLOSED")]);
    const issues = validateProject(project);
    expect(issues).toEqual([expect.objectContaining({ rule: "STAIR_PREVIEW_APPROXIMATION", severity: "warning", blockId: "stair_closed" })]);
  });

  it("上落脚点没有同高楼板就报支撑，够得着的下落脚点不报", () => {
    const project = withNode([floor("floor_room"), stairs("stair_up", 10)]);
    const issues = validateProject(project);
    expect(issues.map((issue) => issue.rule)).toEqual(["LANDING_SUPPORT"]);
    expect(issues[0].message).toContain("楼梯上端");
  });

  it("出入口挑在楼板外面也算没有支撑", () => {
    const project = withNode([floor("floor_room"), port("port_outside", [0, 500, 40])]);
    const issues = validateProject(project);
    expect(issues.map((issue) => issue.rule)).toEqual(["LANDING_SUPPORT"]);
    expect(issues[0].message).toContain("出入口");
  });

  it("落脚点上压着体块或净空不足时报阻挡，移走它就不报", () => {
    const blocked = withNode([floor("floor_room"), stairs("stair_up", 10), box("solid_pillar", [0, -180, 0], [200, 200, 300])]);
    expect(validateProject(blocked).map((issue) => issue.rule)).toContain("LANDING_CLEARANCE");

    const cleared = withNode([floor("floor_room"), stairs("stair_up", 10)]);
    expect(validateProject(cleared).map((issue) => issue.rule)).not.toContain("LANDING_CLEARANCE");
  });

  it("来自未确认图纸的积木会被标出来，不混进「已核实」里", () => {
    const estimated = { ...box("block_guessed", [500, 0, 0], [100, 100, 100]), provenance: { sourceId: "ref", featureId: "f1", status: "estimated" as const, note: "" } };
    const issues = validateProject(withNode([estimated]));
    expect(issues).toEqual([expect.objectContaining({ rule: "REFERENCE_UNCONFIRMED", severity: "warning", blockId: "block_guessed" })]);
  });

  it("子层里的节点一样要查，问题指向子层那个节点", () => {
    const project = createDemoProject();
    const root = addLogicNode(createEmptyTopology(), [0, 0], { name: "外层", blocks: [door("door_outer", 140, 240)] }).topology;
    const expanded = expandNodeScope(root, root.nodes[0].id, "外层内部");
    if (!expanded) throw new Error("展开失败");
    const view = addLogicNode(scopeView(expanded.topology, expanded.scope.id), [0, 0], { name: "内层", blocks: [door("door_inner", 60, 180)] });
    project.concept = writeScopeView(expanded.topology, expanded.scope.id, view.topology);

    const issues = validateProject(project);
    expect(issues.map((issue) => issue.nodeId)).toEqual([view.node.id, view.node.id]);
    expect(issues.map((issue) => issue.blockId)).toEqual(["door_inner", "door_inner"]);
  });

  it("关掉规范检查、或还没有拓扑，都不产出问题", () => {
    const off = withNode([door("door_narrow", 80, 180)]);
    off.blockoutProfile.enabled = false;
    expect(validateProject(off)).toEqual([]);

    const empty = createDemoProject();
    delete empty.concept;
    expect(validateProject(empty)).toEqual([]);
  });
});
