import { describe, expect, it } from "vitest";
import { collectScopeIssues, computeTopologyDigest, createEmptyTopology, logicTopologySchema, type LogicTopology } from "./concept";
import { addLogicLink, addLogicNode, createLogicModule, updateLogicNode } from "./concept-commands";
import {
  collapseModule,
  expandModule,
  flattenModules,
  leafModules,
  linkScope,
  pathKey,
  pathLabel,
  removeScope,
  scopeCrumbs,
  scopeView,
  writeScopeView,
} from "./concept-scopes";
import { generateConfiguration } from "./concept-configuration";
import { generateAssembly } from "./concept-assembly";
import { applyConfiguration } from "./commands";
import { buildLocalUEDryRun } from "./ue-plan";
import { createDemoProject } from "./demo-project";
import type { BlockoutProject } from "./types";

function base(): BlockoutProject {
  const demo = createDemoProject();
  return { ...demo, projectId: "test_project", name: "测试", modules: [], instances: [], connections: [], assemblyAnchorInstanceId: undefined, concept: undefined };
}

/** 根作用域放一个"游乐园"（展开），子作用域里放"马戏团"与"鬼屋"并各自成模块 */
function park(): { topology: LogicTopology; parkModuleId: string; scopeId: string; villageModuleId: string; villageNodeId: string } {
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

  return { topology, parkModuleId, scopeId, villageModuleId: villageModule.module.id, villageNodeId: village.node.id };
}

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
    // 还没套用构型时模块没有自己的相对原点，累积结果就是父级原点
    const before = flattenModules(topology);
    expect(before.find((entry) => entry.module.name === "鬼屋")?.path).toHaveLength(1);

    // 套用构型之后，每个模块有了自己的原点：游乐园(0,0) 内部 马戏团(0,0) / 鬼屋(2000,0)
    const configured = applyConfiguration({ ...base(), concept: topology }, generateConfiguration(topology));
    const flat = flattenModules(configured.project.concept as LogicTopology);

    const village = flat.find((entry) => entry.module.name === "小村");
    expect(village?.origin).toEqual([-4900, -900]);
    expect(village?.path).toHaveLength(0);

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

describe("嵌套：构型与组装", () => {
  it("展开的模块不产出构型，几何由子层负责", () => {
    const { topology } = park();
    const candidate = generateConfiguration(topology);
    const names = candidate.modules.map((entry) => topology.modules.concat(...topology.scopes.map((scope) => scope.modules)).find((module) => module.id === entry.moduleId)?.name);
    expect(names).not.toContain("游乐园");
    expect(names).toContain("鬼屋");
  });

  it("组装把嵌套模块放到累积位置上，并写入层级路径", () => {
    const { topology } = park();
    const configured = applyConfiguration({ ...base(), concept: topology }, generateConfiguration(topology));
    const assembled = generateAssembly(configured.project);
    const concept = assembled.project.concept as LogicTopology;

    const houseInstance = assembled.project.instances.find((instance) => instance.name === "鬼屋");
    const houseModule = concept.scopes[0].modules.find((module) => module.name === "鬼屋");
    expect(houseInstance?.definitionId).toBe(houseModule?.moduleDefinitionId);
    expect(houseInstance?.scopePath).toHaveLength(1);
    // 鬼屋在子作用域 (2000,0)，reward 模板 2000×2000 → 模块局部原点 (1000,-1000)；
    // 游乐园模块在根的原点也是 (0,0)（hub 3000×3000 但节点在 (0,0)）→ 累积 (1000,-1000)
    expect(houseInstance?.assemblyTransform.position[0]).toBe(1000);
    expect(houseInstance?.assemblyTransform.position[1]).toBe(-1000);
  });

  it("指向已展开模块的跨层链路会被报出来，而不是悄悄丢掉", () => {
    const { topology } = park();
    const configured = applyConfiguration({ ...base(), concept: topology }, generateConfiguration(topology));
    const assembled = generateAssembly(configured.project);
    // 小村 → 游乐园 这条链路的一端是展开的模块，没有单一实例可接
    expect(assembled.result.skippedLinks.some((entry) => entry.includes("游乐园"))).toBe(true);
    const next = generateAssembly(assembled.project);
    expect(next.result.skippedLinks).toEqual(assembled.result.skippedLinks);
    expect(generateAssembly(base()).result.skippedLinks).toEqual([]);
  });

  it("不同作用域的同名本地节点按所属模块取数，不串用名称或端口", () => {
    const { topology, villageNodeId } = park();
    const child = topology.scopes[0];
    const previousId = child.nodes[0].id;
    child.nodes[0].id = villageNodeId;
    child.startNodeId = villageNodeId;
    child.modules[0].nodeIds = [villageNodeId];
    child.links = child.links.map((link) => ({ ...link, from: link.from === previousId ? villageNodeId : link.from }));
    const configured = applyConfiguration({ ...base(), concept: topology }, generateConfiguration(topology)).project;
    const village = configured.modules.find((module) => module.name === "小村")!;
    const circus = configured.modules.find((module) => module.name === "马戏团")!;
    expect(village.blocks.find((block) => block.type === "box")?.name).toBe("小村");
    expect(circus.blocks.find((block) => block.type === "box")?.name).toBe("马戏团");
    expect(village.blocks.find((block) => block.type === "port")?.name).toContain("小村");
    expect(circus.blocks.find((block) => block.type === "port")?.name).toContain("马戏团");
  });

  it("同步键带路径段，两个分支的同名积木不会撞键", () => {
    const { topology, scopeId } = park();
    const reused = createLogicModule(topology, "游乐园副本", []);
    const shared = linkScope(reused.topology, reused.module.id, scopeId);
    const configured = applyConfiguration({ ...base(), concept: shared }, generateConfiguration(shared));
    const assembled = generateAssembly(configured.project);

    const plan = buildLocalUEDryRun(assembled.project);
    const keys = plan.actors.map((actor) => actor.syncKey);
    expect(new Set(keys).size).toBe(keys.length);

    const houseActors = plan.actors.filter((actor) => actor.label.includes("鬼屋"));
    expect(houseActors.length).toBeGreaterThanOrEqual(2);
    // 两条分支的键不同，标签也带上了层级
    expect(new Set(houseActors.map((actor) => actor.syncKey)).size).toBe(houseActors.length);
    expect(houseActors[0].label.split(" / ").length).toBeGreaterThanOrEqual(3);
  });

  it("层级变化会让拓扑指纹变化（上游提案因此过期）", () => {
    const { topology, scopeId } = park();
    const before = computeTopologyDigest(topology);
    const view = scopeView(topology, scopeId);
    const renamed = updateLogicNode(view, view.nodes[0].id, { name: "改过名的马戏团" });
    const modified = writeScopeView(topology, scopeId, renamed);
    expect(computeTopologyDigest(modified)).not.toBe(before);
  });
});
