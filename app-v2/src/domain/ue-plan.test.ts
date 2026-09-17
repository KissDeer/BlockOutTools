import { describe, expect, it } from "vitest";
import { createDemoProject } from "./demo-project";
import { buildLocalUEDryRun } from "./ue-plan";

describe("UE Actor 计划", () => {
  it("保留 assemblyIssues 兼容键，且恒为空数组", () => {
    // 端口约束检查（原 resolveAssembly）查的是"模块实例拼起来对不对得上"，随模块层一起删除，
    // 所以这里没有产出者。键仍然要留着：scripts/ue_unreal_spawn.py 会读
    // plan['assemblyIssues']，已导出的 layouts/ue-plan/*.blockout.actors.json 也带着它 ——
    // 删键会让 app 之外的工具链静默少一项。这条断言就是防止"清理无用字段"时把它顺手删掉。
    const plan = buildLocalUEDryRun(createDemoProject());
    expect(Object.keys(plan)).toContain("assemblyIssues");
    expect(plan.assemblyIssues).toEqual([]);
  });
});
