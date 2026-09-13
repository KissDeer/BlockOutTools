import { describe, expect, it } from "vitest";
import { createEmptyTopology } from "./concept";
import { addInput, applyCandidate, updateInput } from "./concept-commands";
import {
  createEmptyCandidate,
  pruneCandidate,
  summarizeCandidate,
  toRelativePosition,
  validateCandidate,
  type RecognitionCandidate,
} from "./concept-candidate";
import type { LogicTopology } from "./concept";
import type { LogicInputCalibration } from "./concept-inputs";

/** 一张已标定比例的范围图 + 对应 digest 的拓扑 */
function withCalibratedScopeMap(): { topology: LogicTopology; scopeMapId: string } {
  const first = addInput(createEmptyTopology(), {
    kind: "scope-map", name: "范围图.png", imageData: "data:image/png;base64,AAA", pixelSize: [1000, 800],
  });
  const calibrated = updateInput(first.topology, first.item.id, {
    calibration: { cmPerPixel: 2, origin: [0, 0], rotation: 0, confirmed: true },
  });
  return { topology: calibrated, scopeMapId: first.item.id };
}

function candidateFor(topology: LogicTopology, scopeMapId: string): RecognitionCandidate {
  return {
    ...createEmptyCandidate(topology.inputs.digest, scopeMapId),
    name: "测试候选",
    nodes: [
      { tempId: "n1", name: "入口", role: "start", floor: 0, scopeMapPoint: [100, 100], elevation: { base: 0, top: 300 }, note: "" },
      { tempId: "n2", name: "中庭", role: "hub", floor: 0, scopeMapPoint: [400, 200], elevation: null, note: "" },
      { tempId: "n3", name: "深处", role: "boss", floor: 1, scopeMapPoint: [700, 500], elevation: { base: 300, top: 700 }, note: "" },
    ],
    links: [
      { tempId: "l1", label: "A", from: "n1", to: "n2", logic: "normal", traversal: "both", requiresKey: null, note: "" },
      { tempId: "l2", label: "B", from: "n2", to: "n3", logic: "locked-door", traversal: "both", requiresKey: "k1", note: "" },
    ],
    keys: [{ tempId: "k1", name: "铁钥匙", foundAt: "n1", unlocks: ["l2"], note: "" }],
  };
}

describe("识别候选：校验", () => {
  it("候选依据的输入变了就不允许套用", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    const candidate = candidateFor(topology, scopeMapId);
    expect(validateCandidate(candidate, topology).some((issue) => issue.severity === "error")).toBe(false);

    const supplemented = addInput(topology, { kind: "rules", name: "规范", text: "层高 300" });
    const issues = validateCandidate(candidate, supplemented.topology);
    expect(issues.some((issue) => issue.id === "candidate:stale" && issue.severity === "error")).toBe(true);
  });

  it("悬空引用与无钥匙的锁钥门都算错误", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    const candidate = candidateFor(topology, scopeMapId);
    candidate.links[0].to = "nope";
    candidate.links[1].requiresKey = null;
    const rules = validateCandidate(candidate, topology).filter((issue) => issue.severity === "error").map((issue) => issue.id);
    expect(rules).toContain("candidate:link-node:l1");
    expect(rules).toContain("candidate:key-missing:l2");
  });

  it("没有范围图或没有标定比例时给出提示而不是报错", () => {
    const { topology } = withCalibratedScopeMap();
    const candidate = candidateFor(topology, "不存在");
    const issues = validateCandidate(candidate, topology);
    expect(issues.some((issue) => issue.id === "candidate:no-scope-map")).toBe(true);
    expect(issues.some((issue) => issue.severity === "error")).toBe(false);
  });

  it("统计已给位置的节点数", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    const candidate = candidateFor(topology, scopeMapId);
    candidate.nodes[2].scopeMapPoint = null;
    expect(summarizeCandidate(candidate)).toMatchObject({ nodes: 3, links: 2, keys: 1, placed: 2, located: 2 });
  });
});

describe("识别候选：人工排除", () => {
  it("排除节点会连带丢弃挂它的链路与失去目标的钥匙", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    const pruned = pruneCandidate(candidateFor(topology, scopeMapId), ["n2"]);
    expect(pruned.nodes.map((node) => node.tempId)).toEqual(["n1", "n3"]);
    expect(pruned.links).toHaveLength(0);   // A 与 B 都挂在 n2 上
    expect(pruned.keys).toHaveLength(0);    // 钥匙只解锁 B，B 没了就一起走
  });

  it("排除链路会连带把钥匙的解锁目标清掉", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    const pruned = pruneCandidate(candidateFor(topology, scopeMapId), ["l2"]);
    expect(pruned.links.map((link) => link.tempId)).toEqual(["l1"]);
    expect(pruned.keys).toHaveLength(0);
  });
});

describe("识别候选：套用", () => {
  it("像素按标定换算成父级局部厘米", () => {
    const calibration: LogicInputCalibration = { cmPerPixel: 2, origin: [100, 50], rotation: 0, confirmed: true };
    expect(toRelativePosition([10, 20], calibration)).toEqual([120, 90]);
    expect(toRelativePosition([10, 20], null)).toBeNull();
  });

  it("套用后节点、链路、锁钥都接通，并写入相对位置与标高", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    const result = applyCandidate(topology, candidateFor(topology, scopeMapId));
    const next = result.topology;

    expect(result.applied.nodeIds).toHaveLength(3);
    expect(result.applied.linkIds).toHaveLength(2);
    expect(result.applied.keyIds).toHaveLength(1);
    expect(result.applied.placed).toBe(3);

    const entry = next.nodes.find((node) => node.name === "入口");
    expect(entry?.relativePosition).toEqual([200, 200]);       // 100px * 2cm/px
    expect(entry?.elevation).toEqual({ base: 0, top: 300 });
    expect(next.startNodeId).toBe(next.nodes[0].id);

    const locked = next.links.find((link) => link.logic === "locked-door");
    expect(locked?.requires).toBe(next.keys[0].id);
    expect(next.keys[0].foundAt).toBe(entry?.id);
    expect(next.keys[0].unlocks).toEqual([locked?.id]);
  });

  it("套用不会删除已有节点", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    const existing = applyCandidate(createEmptyTopology(), { ...candidateFor(topology, scopeMapId), basedOnInputsDigest: createEmptyTopology().inputs.digest });
    const merged = applyCandidate(existing.topology, candidateFor(existing.topology, scopeMapId));
    expect(merged.topology.nodes).toHaveLength(6);
  });

  it("链路标签保持唯一，图上标注记进备注", () => {
    const { topology, scopeMapId } = withCalibratedScopeMap();
    // 先占掉 A、B 两个标签
    const occupied = applyCandidate(createEmptyTopology(), { ...candidateFor(topology, scopeMapId), basedOnInputsDigest: createEmptyTopology().inputs.digest });
    const merged = applyCandidate(occupied.topology, candidateFor(occupied.topology, scopeMapId));
    const labels = merged.topology.links.map((link) => link.label);
    expect(labels.length).toBe(new Set(labels).size);

    const traced = merged.topology.links.filter((link) => link.note.includes("图上标注"));
    // 套用了两次，所以 4 条链路都带追溯备注
    expect(traced).toHaveLength(4);
    expect(traced.map((link) => link.note)).toEqual(expect.arrayContaining([expect.stringContaining("图上标注 A"), expect.stringContaining("图上标注 B")]));
  });

  it("画布坐标与相对位置分开：二者不能混成一套数", () => {    const { topology, scopeMapId } = withCalibratedScopeMap();
    const result = applyCandidate(topology, candidateFor(topology, scopeMapId));
    const entry = result.topology.nodes.find((node) => node.name === "入口");
    // 范围图 1000×800 像素等比映射到 900×600 的画布区域，坐标应落在几百的量级
    expect(entry?.graphPosition[0]).toBeGreaterThanOrEqual(160);
    expect(entry?.graphPosition[0]).toBeLessThan(1100);
    expect(entry?.graphPosition[1]).toBeGreaterThanOrEqual(140);
    expect(entry?.graphPosition[1]).toBeLessThan(800);
    // 相对位置是厘米，保持原值
    expect(entry?.relativePosition).toEqual([200, 200]);
  });
});
