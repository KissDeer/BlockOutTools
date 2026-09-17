import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDemoProject } from "./demo-project";
import { parseProjectFile } from "./persistence";
import { projectSchema } from "./project-schema";

/*
 * 项目文件的读入口必须拒绝**模块层删除之前**的旧项目。
 *
 * 这条测试守的是一个真实发生过的数据事故：`concept` 曾经是可选的，于是一个旧文件
 * 能通过 schema 校验，读出来是个"一个区域都没有"的合法项目，导出 0 个 Actor 并成功退出，
 * 把已提交的 104 个 Actor 覆盖成空数组。静默读成空，比拒绝读取危险得多。
 *
 * 旧格式断言用的是仓库里真实存在的文件，不是临时造的夹具 ——
 * 要守的正是"用户手里那些文件"这条路。旧格式有互不重叠的三个家族
 * （更早画布的 `shapes` / `structureGraph`，模块层的 `modules`），每个家族都要有真文件断言：
 * 只测一个家族会让另外两个悄悄漏掉，初版就是这么漏的。
 */
const layout = (name: string) => readFileSync(resolve(__dirname, "../../../layouts", name), "utf8");
const level = (name: string) => readFileSync(resolve(__dirname, "../../../data/levels", name), "utf8");

describe("读项目文件：旧格式必须被拒绝", () => {
  it("含 structureGraph 的旧画布项目给出人话原因，而不是 Zod 路径", () => {
    expect(() => parseProjectFile(level("洛斯里克高墙_四级平台_改进版.json"))).toThrow(/模块层删除之前.*structureGraph/);
  });

  it("含 modules / instances / connections 的模块层项目被拒绝", () => {
    // 这个文件既没有 structureGraph 也没有 shapes：判据漏掉它就会落到 schema，报一串 Zod 路径
    expect(() => parseProjectFile(layout("souls-starter-floor-wall.blockout.json")))
      .toThrow(/模块层删除之前.*modules \/ instances \/ connections/);
  });

  it("两个家族都有的文件也把人话原因说全", () => {
    expect(() => parseProjectFile(layout("sunken-sanctum.blockout.json"))).toThrow(/模块层删除之前/);
  });

  it("只含 shapes 的更早画布格式也被拒绝", () => {
    const ancient = { ...createDemoProject(), shapes: [], entities: [], layers: [] } as Record<string, unknown>;
    delete ancient.concept;
    expect(() => parseProjectFile(JSON.stringify(ancient))).toThrow(/模块层删除之前.*shapes/);
  });

  it("旧格式标记都不在时，schema 仍然拦住缺几何的项目", () => {
    // safeParse 而不是 parseProjectFile：这里要断言的是"被哪个字段拦下"，
    // 否则换一个字段也能让测试通过，等于没守住 concept
    const stripped = { ...createDemoProject() } as Record<string, unknown>;
    delete stripped.concept;
    const result = projectSchema.safeParse(stripped);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "concept")).toBe(true);
  });

  it("新格式项目照常读得进来", () => {
    const project = createDemoProject();
    expect(parseProjectFile(JSON.stringify(project)).projectId).toBe(project.projectId);
  });
});
