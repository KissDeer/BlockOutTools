import { describe, expect, it } from "vitest";
import { collectScopeIssues, computeTopologyDigest, createEmptyTopology, logicTopologySchema, type LogicTopology } from "./concept";
import { addLogicLink, addLogicNode, createLogicModule, updateLogicNode } from "./concept-commands";
import {
  collapseModule,
  expandModule,
  flattenModules,
  leafModules,
  levelPathOfNode,
  linkScope,
  nodeInterior,
  pathKey,
  pathLabel,
  removeScope,
  resolveLevel,
  scopeCrumbs,
  scopeView,
  writeScopeView,
} from "./concept-scopes";
import { buildLocalUEDryRun } from "./ue-plan";
import { createDemoProject } from "./demo-project";
import type { BlockoutProject } from "./types";

function base(): BlockoutProject {
  const demo = createDemoProject();
  return { ...demo, projectId: "test_project", name: "测试", modules: [], instances: [], connections: [], assemblyAnchorInstanceId: undefined, concept: undefined };
}

/** 根作用域放一个"游乐园"（展开），子作用域里放"马戏团"与"鬼屋"并各自成模块 */
function park(): {
  topology: LogicTopology; parkModuleId: string; scopeId: string;
  villageModuleId: string; villageNodeId: string;
  parkNodeId: string; circusNodeId: string; houseNodeId: string;
} {
  let topology = createEmptyTopology();
  const outer = addLogicNode(topology, [0, 0], { name: "游乐园", role: "hub" });
  topology = outer.topology;
  const village = addLogicNode(topology, [-4000, 0], { name: "小村", role: "start" });
  topology = village.topology;
  topology = updateLogicNode(topology, outer.node.id, { relativePosition: [0, 0] });
  topology = updateLogicNode(topology, village.node.id, { relativePosition: [-4000, 0] });
  const linked = addLogicLink(topology, village.node.id, outer.node.id, "normal");
  topology = linked ? linked.topology : topology;
  topology = createLogicModule(topology, "游乐园", [outer.node.id]).topology;
  const villageModule = createLogicModule(topology, "小村", [village.node.id]);
  topology = villageModule.topology;

  const parkModuleId = topology.modules.find((module) => module.name === "游乐园")?.id as string;
  const expanded = expandModule(topology, parkModuleId, "游乐园内部");
  if (!expanded) throw new Error("展开失败");
  topology = expanded.topology;
  const scopeId = expanded.scope.id;

  // 子作用域内部：先放节点，再在**子作用域里**做拆解
  let view = scopeView(topology, scopeId);
  const circus = addLogicNode(view, [0, 0], { name: "马戏团", role: "combat" });
  view = circus.topology;
  const house = addLogicNode(view, [2000, 0], { name: "鬼屋", role: "reward" });
  view = house.topology;
  view = updateLogicNode(view, circus.node.id, { relativePosition: [0, 0] });
  view = updateLogicNode(view, house.node.id, { relativePosition: [2000, 0] });
  const inner = addLogicLink(view, circus.node.id, house.node.id, "normal");
  view = inner ? inner.topology : view;
  view = createLogicModule(view, "马戏团", [circus.node.id]).topology;
  view = createLogicModule(view, "鬼屋", [house.node.id]).topology;
  topology = writeScopeView(topology, scopeId, view);

  return {
    topology, parkModuleId, scopeId,
    villageModuleId: villageModule.module.id, villageNodeId: village.node.id,
    parkNodeId: outer.node.id, circusNodeId: circus.node.id, houseNodeId: house.node.id,
  };
}

describe("层级：一张画布上的焦点路径", () => {
  it("空路径就是整图，能看到根层全部节点与链路", () => {
    const { topology } = park();
    const level = resolveLevel(topology, []);
    expect(level.kind).toBe("logic");
    expect(level.scopeId).toBeNull();
    expect(level.nodeId).toBeNull();
    expect(level.nodes.map((node) => node.name)).toEqual(["游乐园", "小村"]);
    expect(level.links).toHaveLength(1);
    expect(level.steps).toEqual([]);
    expect(level.brokenAt).toBeNull();
  });

  it("进入有内部的节点 = 换到那一层的逻辑，人没离开画布", () => {
    const { topology, parkNodeId, scopeId } = park();
    const level = resolveLevel(topology, [parkNodeId]);
    expect(level.kind).toBe("logic");
    expect(level.scopeId).toBe(scopeId);
    expect(level.nodes.map((node) => node.name)).toEqual(["马戏团", "鬼屋"]);
    expect(level.steps.map((step) => step.nodeName)).toEqual(["游乐园"]);
    expect(level.steps[0].kind).toBe("logic");
  });

  it("进入没有内部的节点 = 几何层，同时仍知道自己属于哪一层", () => {
    const { topology, parkNodeId, circusNodeId, scopeId } = park();
    const level = resolveLevel(topology, [parkNodeId, circusNodeId]);
    expect(level.kind).toBe("geometry");
    expect(level.nodeId).toBe(circusNodeId);
    // 几何层不切换作用域：仍然看得到它所在那一层的其他节点
    expect(level.scopeId).toBe(scopeId);
    expect(level.nodes.map((node) => node.name)).toEqual(["马戏团", "鬼屋"]);
    expect(level.steps.map((step) => step.kind)).toEqual(["logic", "geometry"]);
  });

  it("多层嵌套逐层解析，每层各看各的内容", () => {
    const { topology, parkNodeId, circusNodeId } = park();
    // 把"鬼屋"再展开一层，做成三层
    const houseModuleId = topology.scopes[0].modules.find((module) => module.name === "鬼屋")?.id as string;
    const houseNodeId = topology.scopes[0].nodes.find((node) => node.name === "鬼屋")?.id as string;
    const deeper = expandModule(topology, houseModuleId, "鬼屋内部");
    expect(deeper).not.toBeNull();
    // 在鬼屋内部放一个区域
    const innerView = addLogicNode(scopeView(deeper!.topology, deeper!.scope.id), [0, 0], { name: "地下室", role: "secret" });
    const withRoom = writeScopeView(deeper!.topology, deeper!.scope.id, innerView.topology);

    // 第一层：整图
    expect(resolveLevel(withRoom, []).nodes.map((node) => node.name)).toEqual(["游乐园", "小村"]);
    // 第二层：游乐园内部
    expect(resolveLevel(withRoom, [parkNodeId]).nodes.map((node) => node.name)).toEqual(["马戏团", "鬼屋"]);
    // 第三层：鬼屋内部
    const third = resolveLevel(withRoom, [parkNodeId, houseNodeId]);
    expect(third.kind).toBe("logic");
    expect(third.nodes.map((node) => node.name)).toEqual(["地下室"]);
    expect(third.steps.map((step) => step.nodeName)).toEqual(["游乐园", "鬼屋"]);
    // 马戏团没有内部，进去就是几何层
    expect(resolveLevel(withRoom, [parkNodeId, circusNodeId]).kind).toBe("geometry");
  });

  it("路径失效时安全退回，不抛错也不假装还在那一层", () => {
    const { topology, parkNodeId } = park();
    const level = resolveLevel(topology, [parkNodeId, "lnode_不存在"]);
    expect(level.brokenAt).toBe(1);
    // 退回上一层，而不是整图
    expect(level.scopeId).toBe(topology.scopes[0].id);
  });

  it("层级的可见内容会随拓扑变化自动跟上，不需要另存状态", () => {
    const { topology, parkNodeId } = park();
    const before = resolveLevel(topology, [parkNodeId]).nodes.length;
    const view = scopeView(topology, topology.scopes[0].id);
    const grown = writeScopeView(topology, topology.scopes[0].id, addLogicNode(view, [4000, 0], { name: "售票处" }).topology);
    expect(resolveLevel(grown, [parkNodeId]).nodes.length).toBe(before + 1);
  });

  it("层级树能从节点反查出它显示在哪一层", () => {
    const { topology, parkNodeId, circusNodeId, villageNodeId } = park();
    // 游乐园自己在根层可见；要看到它的内部才需要进入它
    expect(levelPathOfNode(topology, parkNodeId)).toEqual([]);
    expect(levelPathOfNode(topology, villageNodeId)).toEqual([]);
    // 马戏团在游乐园内部才可见
    expect(levelPathOfNode(topology, circusNodeId)).toEqual([parkNodeId]);
    expect(levelPathOfNode(topology, "lnode_不存在")).toBeNull();
  });

  it("节点内部是什么可以直接问出来", () => {
    const { topology, parkNodeId, circusNodeId } = park();
    expect(nodeInterior(topology, parkNodeId)).toMatchObject({ kind: "logic", childCount: 2, linkCount: 1 });
    expect(nodeInterior(topology, circusNodeId)).toMatchObject({ kind: "geometry", childCount: 0 });
  });
});

describe("嵌套：旧草稿兼容", () => {
  it("根作用域没有 id/name/scopes 的旧草稿仍能解析，不会被静默丢弃", () => {
    const legacy = {
      nodes: [],
      links: [],
      keys: [],
      startNodeId: null,
      inputs: { revision: 2, items: [], digest: "abc", updatedAt: new Date(0).toISOString() },
      proposals: [],
      modules: [{ id: "m1", name: "旧模块", nodeIds: [], note: "" }],
    };
    const parsed = logicTopologySchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.id).toBe("scope_root");
    expect(parsed.data.name).toBe("根作用域");
    expect(parsed.data.scopes).toEqual([]);
    // 旧数据本身必须原样保留
    expect(parsed.data.modules).toHaveLength(1);
    expect(parsed.data.inputs.revision).toBe(2);
  });
});

describe("嵌套：展开与收起", () => {
  it("展开会建立子作用域并解除自身构型", () => {
    const { topology, parkModuleId, scopeId } = park();
    const module = topology.modules.find((item) => item.id === parkModuleId);
    expect(module?.childScopeId).toBe(scopeId);
    expect(topology.scopes).toHaveLength(1);
    expect(topology.scopes[0].nodes.map((node) => node.name)).toEqual(["马戏团", "鬼屋"]);
    expect(collectScopeIssues(topology)).toHaveLength(0);
  });

  it("收起只解除引用，作用域留在池子里（可能还有别的模块复用）", () => {
    const { topology, parkModuleId, scopeId } = park();
    const collapsed = collapseModule(topology, parkModuleId);
    expect(collapsed.modules.find((item) => item.id === parkModuleId)?.childScopeId).toBeUndefined();
    expect(collapsed.scopes.some((scope) => scope.id === scopeId)).toBe(true);
  });

  it("移除作用域会解除全部引用", () => {
    const { topology, parkModuleId, scopeId } = park();
    const removed = removeScope(topology, scopeId);
    expect(removed.scopes).toHaveLength(0);
    expect(removed.modules.find((item) => item.id === parkModuleId)?.childScopeId).toBeUndefined();
  });
});

describe("嵌套：自包含检测", () => {
  it("作用域直接或间接包含自己会被报出来", () => {
    const { topology, scopeId } = park();
    // 在子作用域里再加一个模块，指回它自己
    let view = scopeView(topology, scopeId);
    const created = createLogicModule(view, "回环", []);
    view = created.topology;
    const cyclic = linkScope(writeScopeView(topology, scopeId, view), created.module.id, scopeId);
    expect(collectScopeIssues(cyclic).some((issue) => issue.includes("包含了自己"))).toBe(true);
  });

  it("引用不存在的子作用域会被报出来", () => {
    const { topology, parkModuleId } = park();
    const dangling: LogicTopology = {
      ...topology,
      modules: topology.modules.map((module) => module.id === parkModuleId ? { ...module, childScopeId: "scope_missing" } : module),
    };
    expect(collectScopeIssues(dangling).some((issue) => issue.includes("不存在的子作用域"))).toBe(true);
  });
});

describe("嵌套：路径与展平", () => {
  it("展平会累积父级原点并给出层级路径", () => {
    const { topology } = park();
    // 还没落成构型时模块没有自己的相对原点，累积结果就是父级原点
    const before = flattenModules(topology);
    expect(before.find((entry) => entry.module.name === "鬼屋")?.path).toHaveLength(1);

    // 直接给模块标上相对原点（构型落成后就是这个状态），验证逐层累积
    const withOrigins: LogicTopology = {
      ...topology,
      modules: topology.modules.map((module) => ({ ...module, relativeOrigin: module.name === "游乐园" ? [0, 0] : [-4900, -900] })),
      scopes: topology.scopes.map((scope) => ({
        ...scope,
        modules: scope.modules.map((module) => ({ ...module, relativeOrigin: module.name === "鬼屋" ? [1000, -1000] : [-500, -900] })),
      })),
    };
    const flat = flattenModules(withOrigins);

    const village = flat.find((entry) => entry.module.name === "小村");
    expect(village?.origin).toEqual([-4900, -900]);
    expect(village?.path).toHaveLength(0);

    // 鬼屋 = 游乐园原点 (0,0) + 它自己的 (1000,-1000)
    const house = flat.find((entry) => entry.module.name === "鬼屋");
    expect(house?.origin).toEqual([1000, -1000]);
    expect(house?.path).toHaveLength(1);
    expect(house?.path[0].scopeName).toBe("游乐园内部");
  });

  it("展开的模块本身不再是叶子", () => {
    const { topology } = park();
    const leaves = leafModules(topology);
    expect(leaves.map((entry) => entry.module.name)).not.toContain("游乐园");
    expect(new Set(leaves.map((entry) => entry.module.name))).toEqual(new Set(["小村", "马戏团", "鬼屋"]));
  });

  it("面包屑能指到子作用域，路径标签用模块名", () => {
    const { topology, scopeId } = park();
    const crumbs = scopeCrumbs(topology, scopeId);
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].moduleName).toBe("游乐园");
    expect(crumbs[0].scopeName).toBe("游乐园内部");
    expect(pathLabel(crumbs)).toBe("游乐园");
    expect(pathKey(crumbs)).toBe(crumbs[0].moduleId);
  });

  it("同一个作用域被两个模块复用时，展平出两条独立分支", () => {
    const { topology, scopeId } = park();
    // 根作用域再加一个模块，也指向同一个子作用域
    const reused = createLogicModule(topology, "游乐园副本", []);
    const shared = linkScope(reused.topology, reused.module.id, scopeId);
    const flat = flattenModules(shared);
    const houses = flat.filter((entry) => entry.module.name === "鬼屋");
    expect(houses).toHaveLength(2);
    expect(new Set(houses.map((entry) => pathKey(entry.path))).size).toBe(2);
  });
});

describe("嵌套：指纹", () => {
  it("层级变化会让拓扑指纹变化（上游提案因此过期）", () => {
    const { topology, scopeId } = park();
    const before = computeTopologyDigest(topology);
    const view = scopeView(topology, scopeId);
    const renamed = updateLogicNode(view, view.nodes[0].id, { name: "改过名的马戏团" });
    const modified = writeScopeView(topology, scopeId, renamed);
    expect(computeTopologyDigest(modified)).not.toBe(before);
  });
});
