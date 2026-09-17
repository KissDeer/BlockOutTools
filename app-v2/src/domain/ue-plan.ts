import { CATALOG, isDeployableBlock } from "./catalog";
import { actorSyncKey } from "./ids";
import { ancestorPath, flattenNodeGeometry, flattenProjectGeometry, type FlatGeometry } from "./node-geometry";
import type { Block, BlockoutProject } from "./types";

export interface UEActorPlan {
  syncKey: string;
  label: string;
  blockType: Block["type"];
  blueprintClassPath: string;
  location: [number, number, number];
  rotation: [number, number, number];
  parameters: Record<string, unknown>;
}

export interface UEDryRunPlan {
  projectId: string;
  createdAt: string;
  actorCount: number;
  actors: UEActorPlan[];
  /**
   * 端口约束残差：**恒为空数组**，类型写成空元组就是让这件事在编译期成立。
   *
   * 这项检查原本由 `resolveAssembly` 给出，查的是"模块实例拼起来时端口对不对得上"；
   * 模块层删除后没有实例可拼，检查随求解器一起消失，这里不再有产出者 —— 不是"查过没问题"，
   * 而是"已经没在查"。界面若把它当 0 项通过来显示，那是误读。
   *
   * 键仍然保留：`scripts/ue_unreal_spawn.py` 会读 `plan['assemblyIssues']`，
   * 已导出的 `layouts/ue-plan/*.blockout.actors.json` 也带着它。删键等于让
   * app 之外的工具链静默少一项，属于跨工具的静默破坏。
   */
  assemblyIssues: [];
  /** 没有落位的区域名：它们按原点处理，必须报出来而不是静默叠在一起 */
  unplaced: string[];
}

/**
 * 展平几何 → UE Actor 计划。
 *
 * 与 3D 预览吃的是**同一份** `FlatGeometry`，所以不会出现"网页看着对、UE 不对"。
 * 一个积木一个 Actor（楼梯不拆步）；同步键沿用
 * `projectId / 摆放路径… / 摆放 id / blockId`，改名不影响键。
 */
export function buildUEDryRunFrom(project: BlockoutProject, geometry: FlatGeometry): UEDryRunPlan {
  const classPathByType = new Map(CATALOG.filter((item) => item.blueprintClassPath).map((item) => [item.type, item.blueprintClassPath as string]));
  const actors: UEActorPlan[] = [];

  for (const placed of geometry.blocks) {
    const block = placed.block;
    if (!isDeployableBlock(block)) continue;
    actors.push({
      syncKey: actorSyncKey(project.projectId, placed.placementId, block.id, ancestorPath(placed)),
      label: [...placed.namePath, block.name].join(" / "),
      blockType: block.type,
      blueprintClassPath: classPathByType.get(block.type) ?? "",
      location: [placed.position[0], -placed.position[1], placed.position[2]],
      rotation: [0, 0, -placed.rotation],
      parameters: structuredClone(block.parameters),
    });
  }

  return {
    projectId: project.projectId,
    createdAt: new Date().toISOString(),
    actorCount: actors.length,
    actors,
    assemblyIssues: [],
    unplaced: geometry.unplaced,
  };
}

/** 整张图 */
export function buildLocalUEDryRun(project: BlockoutProject): UEDryRunPlan {
  return buildUEDryRunFrom(project, flattenProjectGeometry(project));
}

/** 某个节点内部（含子层），坐标是节点局部厘米 */
export function buildNodeUEDryRun(project: BlockoutProject, nodeId: string): UEDryRunPlan {
  return buildUEDryRunFrom(project, flattenNodeGeometry(project, nodeId));
}
