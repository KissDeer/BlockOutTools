import { describe, expect, it } from "vitest";
import { createEmptyTopology } from "./concept";
import { addInput, recordProposal, removeInput, updateInput } from "./concept-commands";
import {
  checkInputsCompleteness,
  computeInputsDigest,
  createEmptyInputs,
  INPUT_KINDS,
  latestProposal,
  proposalState,
} from "./concept-inputs";
import type { LogicTopology } from "./concept";

function withRequiredInputs(): LogicTopology {
  const base = createEmptyTopology();
  const topology = addInput(base, { kind: "logic-topology", name: "逻辑拓扑图.png", imageData: "data:image/png;base64,AAA", pixelSize: [800, 600] });
  return addInput(topology.topology, { kind: "scope-map", name: "范围图.png", imageData: "data:image/png;base64,BBB", pixelSize: [900, 700] }).topology;
}

describe("参考资料：指纹", () => {
  it("空材料清单的指纹是稳定的", () => {
    expect(createEmptyInputs().digest).toBe(computeInputsDigest([]));
  });

  it("增删输入会改变指纹", () => {
    const base = createEmptyTopology();
    const before = base.inputs.digest;
    const added = addInput(base, { kind: "rules", name: "规范", text: "层高 300" });
    expect(added.topology.inputs.digest).not.toBe(before);
    const removed = removeInput(added.topology, added.item.id);
    expect(removed.inputs.digest).toBe(before);
  });

  it("修改内容会改变指纹，且与数组顺序无关", () => {
    const base = createEmptyTopology();
    const first = addInput(base, { kind: "rules", name: "规范", text: "层高 300" });
    const second = addInput(first.topology, { kind: "note", name: "说明", text: "鬼屋独立成模块" });
    const items = second.topology.inputs.items;
    expect(computeInputsDigest(items)).toBe(computeInputsDigest([...items].reverse()));

    const changed = updateInput(second.topology, first.item.id, { text: "层高 400" });
    expect(changed.inputs.digest).not.toBe(second.topology.inputs.digest);
  });

  it("revision 递增但内容不变时指纹不变", () => {
    const base = createEmptyTopology();
    const added = addInput(base, { kind: "rules", name: "规范", text: "层高 300" });
    const again = updateInput(added.topology, added.item.id, { note: "" });
    // note 本来就是空，内容没变 → 指纹不变，但 revision 递增了
    expect(again.inputs.digest).toBe(added.topology.inputs.digest);
    expect(again.inputs.revision).toBeGreaterThan(added.topology.inputs.revision);
  });
});

describe("参考资料：完整性", () => {
  it("缺少必需项时报出缺项", () => {
    const result = checkInputsCompleteness(createEmptyInputs());
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["logic-topology", "scope-map"]);
    expect(INPUT_KINDS["logic-topology"].required).toBe(true);
  });

  it("补齐必需项后通过", () => {
    const result = checkInputsCompleteness(withRequiredInputs().inputs);
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("未标定比例时给出提示", () => {
    const result = checkInputsCompleteness(withRequiredInputs().inputs);
    expect(result.warnings.some((warning) => warning.message.includes("比例标定"))).toBe(true);
  });

  it("标定并确认比例后不再提示该项", () => {
    const topology = withRequiredInputs();
    const scopeMap = topology.inputs.items.find((item) => item.kind === "scope-map");
    if (!scopeMap) throw new Error("测试夹具缺少范围图");
    const calibrated = updateInput(topology, scopeMap.id, { calibration: { cmPerPixel: 2.5, origin: [0, 0], rotation: 0, confirmed: true } });
    const result = checkInputsCompleteness(calibrated.inputs);
    expect(result.warnings.some((warning) => warning.message.includes("范围图"))).toBe(false);
    expect(result.warnings.some((warning) => warning.message.includes("规则与规范"))).toBe(true);
  });

  it("警告身份唯一：同名文件的同类问题不会撞 key", () => {
    const base = createEmptyTopology();
    const first = addInput(base, { kind: "logic-topology", name: "同名.png", imageData: "data:image/png;base64,AAA", pixelSize: [10, 10] });
    const second = addInput(first.topology, { kind: "logic-topology", name: "同名.png", imageData: "data:image/png;base64,BBB", pixelSize: [10, 10] });
    const result = checkInputsCompleteness(second.topology.inputs);
    const ids = result.warnings.map((warning) => warning.id);
    expect(ids.length).toBe(new Set(ids).size);
    expect(result.warnings.filter((warning) => warning.message.includes("同名.png"))).toHaveLength(2);
  });
});

describe("参考资料：基准登记的过期判定", () => {
  it("没有登记时状态为 none", () => {
    expect(proposalState(createEmptyInputs(), null)).toBe("none");
  });

  it("登记后与材料一致，补充材料后立刻过期", () => {
    const topology = withRequiredInputs();
    const recorded = recordProposal(topology, "初次登记");
    const proposal = latestProposal(recorded.topology.proposals);
    expect(proposal).not.toBeNull();
    expect(proposalState(recorded.topology.inputs, proposal)).toBe("current");

    // 后续补充一条规范 → 旧基准必须被判为过期，而不是静默沿用
    const supplemented = addInput(recorded.topology, { kind: "rules", name: "规则与规范 1", text: "每层不超过 6 个区域" });
    expect(proposalState(supplemented.topology.inputs, proposal)).toBe("stale");
    expect(supplemented.topology.inputs.revision).toBeGreaterThan(recorded.topology.inputs.revision);
  });

  it("登记记录当时的 revision 与区域数量", () => {
    const topology = withRequiredInputs();
    const recorded = recordProposal(topology);
    const proposal = latestProposal(recorded.topology.proposals);
    expect(proposal?.basedOnInputsRevision).toBe(topology.inputs.revision);
    expect(proposal?.basedOnInputsDigest).toBe(topology.inputs.digest);
    expect(proposal?.nodeCount).toBe(0);
  });
});
