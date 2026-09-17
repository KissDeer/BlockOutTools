import { describe, expect, it } from "vitest";
import { createEmptyScope, createEmptyTopology, logicTopologySchema, type LogicScope, type LogicTopology } from "./concept";
import { addLogicKey, addLogicLink, addLogicNode, createLogicModule } from "./concept-commands";
import { canDeliver } from "./concept-validation";
import { createDemoProject } from "./demo-project";
import { projectSchema } from "./project-schema";

function nested() {
  let child: LogicTopology = { ...createEmptyScope("child", "鬼屋"), scopes: [] };
  child = addLogicNode(child, [0, 0], { name: "入口" }).topology;
  child = addLogicNode(child, [300, 0], { name: "出口" }).topology;
  child = addLogicLink(child, child.nodes[0].id, child.nodes[1].id, "locked-door")!.topology;
  child = addLogicKey(child, child.nodes[0].id, child.links[0].id, "钥匙")!.topology;
  child = createLogicModule(child, "内厅", child.nodes.map((node) => node.id)).topology;
  const { scopes: _pool, ...scope } = child;
  const root = createEmptyTopology();
  root.scopes.push(scope);
  // 子层现在挂在**节点**上：一个作用域只能属于一个节点
  return addLogicNode(root, [0, 0], { name: "游乐园", role: "hub", childScopeId: scope.id }).topology;
}

/** nested() 里那个拥有"鬼屋"子层的节点 */
function scopeOwnerNode(root: LogicTopology) {
  return root.nodes.find((node) => node.childScopeId === "child")!;
}

describe("嵌套拓扑的导入完整性", () => {
  const corruptions: [string, (scope: LogicScope) => void][] = [
    ["重复节点", (scope) => scope.nodes.push(structuredClone(scope.nodes[0]))],
    ["重复链路", (scope) => scope.links.push(structuredClone(scope.links[0]))],
    ["重复钥匙", (scope) => scope.keys.push(structuredClone(scope.keys[0]))],
    ["重复模块", (scope) => scope.modules.push(structuredClone(scope.modules[0]))],
    ["链路端点缺失", (scope) => { scope.links[0].to = "missing"; }],
    ["自连接", (scope) => { scope.links[0].to = scope.links[0].from; }],
    ["锁钥缺失", (scope) => { scope.links[0].requires = "missing"; }],
    ["取钥位置缺失", (scope) => { scope.keys[0].foundAt = "missing"; }],
    ["解锁目标缺失", (scope) => { scope.keys[0].unlocks = ["missing"]; }],
    ["起点缺失", (scope) => { scope.startNodeId = "missing"; }],
    ["模块区域缺失", (scope) => scope.modules[0].nodeIds.push("missing")],
    ["区域重复分配", (scope) => scope.modules.push({ ...scope.modules[0], id: "another" })],
  ];
  it.each(corruptions)("子层%s会被导入校验拦下并注明所在层", (_name, corrupt) => {
    const root = nested();
    corrupt(root.scopes[0]);
    const result = logicTopologySchema.safeParse(root);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "scopes" && issue.message.includes("鬼屋"))).toBe(true);
    expect(canDeliver(root).ok).toBe(false);
  });

  it("两个节点各自拥有一个子层可以保存：一个作用域只属于一个节点", () => {
    const root = nested();
    root.scopes.push({ ...structuredClone(root.scopes[0]), id: "other_child", name: "另一栋鬼屋" });
    const second = addLogicNode(root, [600, 0], { name: "第二座游乐园", role: "hub", childScopeId: "other_child" });
    // 得从起点走得到它，否则交付门会因为"走不到"拦下（这与子层归属无关）
    const linked = addLogicLink(second.topology, scopeOwnerNode(second.topology).id, second.node.id, "normal")!;
    expect(projectSchema.safeParse({ ...createDemoProject(), concept: linked.topology }).success).toBe(true);
    expect(canDeliver(linked.topology).ok).toBe(true);
  });

  it("同一个子层被两个节点同时指定为内部会被拦下", () => {
    const root = nested();
    const second = addLogicNode(root, [600, 0], { name: "第二座游乐园", role: "hub", childScopeId: "child" });
    expect(canDeliver(second.topology).ok).toBe(false);
    expect(canDeliver(second.topology).blockers.some((issue) => issue.rule === "TOPO_SCOPE_STRUCTURE" && issue.message.includes("只能属于一个节点"))).toBe(true);
  });

  it("节点引用了不存在的子作用域会被拦下", () => {
    const root = nested();
    scopeOwnerNode(root).childScopeId = "missing";
    const result = logicTopologySchema.safeParse(root);
    expect(result.success).toBe(false);
    expect(canDeliver(root).blockers.some((issue) => issue.rule === "TOPO_SCOPE_STRUCTURE")).toBe(true);
  });

  it.each(["node", "module"])("子层的%s不能绑定不存在的阶段二模块", (kind) => {
    const root = nested();
    if (kind === "node") root.scopes[0].nodes[0].moduleId = "missing";
    else root.scopes[0].modules[0].moduleDefinitionId = "missing";
    const result = projectSchema.safeParse({ ...createDemoProject(), concept: root });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("鬼屋") && issue.message.includes("不存在"))).toBe(true);
  });
});

describe("递归交付", () => {
  it("子层死锁可以作为草稿保存，但阻止根层交付", () => {
    const root = nested();
    root.scopes[0].keys[0].foundAt = root.scopes[0].nodes[1].id;
    expect(projectSchema.safeParse({ ...createDemoProject(), concept: root }).success).toBe(true);
    const gate = canDeliver(root);
    expect(gate.ok).toBe(false);
    expect(gate.blockers.filter((issue) => issue.rule === "TOPO_KEY_DEADLOCK")).toHaveLength(1);
    expect(gate.blockers.every((issue) => issue.message.includes("鬼屋"))).toBe(true);
  });

  it("递归包含不能通过交付", () => {
    const root = nested();
    root.scopes[0].nodes[0].childScopeId = "child";
    expect(canDeliver(root).blockers.some((issue) => issue.rule === "TOPO_SCOPE_STRUCTURE")).toBe(true);
  });

  it("作用域本身被移除后，节点的引用悬空，交付被拦下", () => {
    const root = nested();
    root.scopes = [];
    expect(canDeliver(root).ok).toBe(false);
  });
});
