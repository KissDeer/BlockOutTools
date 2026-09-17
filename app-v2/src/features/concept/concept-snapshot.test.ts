import { describe, expect, it } from "vitest";
import { computeTopologyDigest, createEmptyScope, createEmptyTopology, type LogicScope, type LogicTopology } from "../../domain/concept";
import { addLogicNode, createLogicModule } from "../../domain/concept-commands";
import { createEmptyDecompositionCandidate, validateDecompositionCandidate } from "../../domain/concept-decomposition";
import { scopeView } from "../../domain/concept-scopes";
import { conceptSnapshot } from "./concept-snapshot";

function fixture() {
  let child: LogicTopology = { ...createEmptyScope("child", "鬼屋内部"), scopes: [] };
  child = addLogicNode(child, [0, 0], { name: "内厅" }).topology;
  child = createLogicModule(child, "大厅", [child.nodes[0].id]).topology;
  child.inputs.digest = "child-inputs";
  const { scopes: _pool, ...scope } = child;
  const deep: LogicScope = createEmptyScope("deep", "地窖");
  scope.modules.push({ id: "basement", name: "地窖", nodeIds: [], note: "", childScopeId: deep.id });
  const root = createEmptyTopology();
  root.inputs.digest = "root-inputs";
  root.scopes = [scope, deep];
  root.modules = [
    { id: "house1", name: "鬼屋一", nodeIds: [], note: "", childScopeId: scope.id, relativeOrigin: [100, 200] },
    { id: "house2", name: "鬼屋二", nodeIds: [], note: "", childScopeId: scope.id, relativeOrigin: [800, 200] },
  ];
  return root;
}

describe("agent 的完整作用域快照", () => {
  it("从子层同步仍保留根、共享子层、深层和模块边界引用，并可序列化", () => {
    const root = fixture();
    const snapshot = JSON.parse(JSON.stringify(conceptSnapshot(root, "child")));
    expect(snapshot.id).toBe(root.id);
    expect(snapshot.inputsDigest).toBe("root-inputs");
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.modules.map((module: { childScopeId: string }) => module.childScopeId)).toEqual(["child", "child"]);
    expect(snapshot.modules[0].relativeOrigin).toEqual([100, 200]);
    expect(snapshot.scopes.map((scope: { id: string }) => scope.id)).toEqual(["child", "deep"]);
    expect(snapshot.scopes[0].nodes[0].name).toBe("内厅");
    expect(snapshot.scopes[0].modules[1].childScopeId).toBe("deep");
    expect(snapshot.activeScope.id).toBe("child");
    snapshot.modules[0].relativeOrigin[0] = 999;
    expect(root.modules[0].relativeOrigin).toEqual([100, 200]);
  });

  it("当前层快照指纹能生成被该层接受的拆解与构型候选", () => {
    const root = fixture();
    const current = scopeView(root, "child");
    const snapshot = conceptSnapshot(root, "child");
    const active = snapshot.activeScope;
    // 当前层也在共享池中，快照要能对上它的指纹
    expect(active.topologyDigest).toBe(computeTopologyDigest(current));
    const decomposition = createEmptyDecompositionCandidate(active.inputsDigest, active.topologyDigest);
    decomposition.modules = [{ tempId: "new", name: "大厅", nodeIds: [current.nodes[0].id], note: "" }];
    expect(validateDecompositionCandidate(decomposition, current).filter((issue) => issue.severity === "error")).toEqual([]);
    expect(active.inputsDigest).not.toBe(snapshot.inputsDigest);
    expect(snapshot.scopes.find((scope) => scope.id === "child")!.topologyDigest).toBe(active.topologyDigest);
  });

  it("根层调用保持兼容，失效的当前层不会静默退回根层", () => {
    const root = fixture();
    expect(conceptSnapshot(root).activeScope.id).toBe(root.id);
    expect(() => conceptSnapshot(root, "missing")).toThrow("当前作用域不存在");
  });
});
