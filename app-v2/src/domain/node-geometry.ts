import { isDeployableBlock } from "./catalog";
import { childScopeIdOf, scopesOf } from "./concept-scopes";
import { blockBaseZ } from "./spatial";
import type { LogicNode } from "./concept";
import type { Block } from "./block-types";
import type { BlockoutProject, Vec2 } from "./types";

/**
 * 展平几何：整张图现在长什么样。
 *
 * 这是**唯一**的几何来源 —— 3D 预览与 UE 导出都吃它，不再各算一套。
 * 单位统一厘米；产出的是世界坐标，只在展平时产生（三套坐标里的第三套）。
 *
 * 两套摆放并存到 1-F：
 *
 * - **节点摆放**（新模型）：节点自己持有 `blocks`，坐标是节点局部厘米。
 *   沿层级累加每一级节点的 `relativePosition` 就落到根坐标系。
 * - **实例摆放**（旧数据）：`ModuleInstance.assemblyTransform` + 模块定义的积木。
 *
 * 两者不会同时算：有节点几何就只算节点，一个都没有才退回实例，
 * 否则同一个体块会出现两次。
 */

export interface Placement {
  /** 摆放身份：节点 id，或旧数据的模块实例 id。同步键用它，所以改名不影响 */
  id: string;
  /** 从根到它的摆放路径（节点模式是节点 id 链；实例模式沿用模块实例路径） */
  path: string[];
  /** 给人看的名字链，标签用 */
  namePath: string[];
}

export interface PlacedBlock {
  placementId: string;
  /** 摆放路径，展平之后彼此不会撞 */
  path: string[];
  namePath: string[];
  /**
   * 积木的**底面中心**世界位置（厘米）。
   *
   * Z 这里是积木的底面标高（相对这一层摆放），还没有按自身高度抬到体块中心 ——
   * 那是画几何时才做的事（见 `blockBaseZ`）。所以 Z 与 XY 的口径不同，
   * 别把它当成"体块中心"，也别再叠加一次积木自身的 Z。
   */
  position: [number, number, number];
  /** 积木的累积朝向（度）：沿路每一级摆放的朝向 + 积木自己的朝向 */
  rotation: number;
  block: Block;
}

export interface FlatGeometry {
  /** 参与的摆放，供"按区域过滤"这类界面用 */
  placements: Placement[];
  blocks: PlacedBlock[];
  /**
   * 没有落位的节点名字。
   *
   * `relativePosition` 为空时按原点处理，但**必须报出来** —— 不然一堆区域全叠在原点，
   * 看起来像 bug，实际是"还没定位置"。这是"不假装"那条规则的具体做法。
   */
  unplaced: string[];
}

/** 递归深度护栏：与子作用域那边一致，环检测漏了也不会把栈跑穿 */
const MAX_DEPTH = 16;

/** 平面绕 Z 旋转。整套几何只有这一处做这件事 */
export function rotate2d(x: number, y: number, degrees: number): [number, number] {
  if (!degrees) return [x, y];
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
}

/**
 * 一个节点自己的积木，**坐标完全不动**（就是积木自己写的那个位置）。
 * 抬到哪一层由调用方决定。
 */
function nodeOwnBlocks(node: LogicNode): { block: Block; position: [number, number, number]; rotation: number }[] {
  return (node.blocks ?? []).map((block) => ({
    block,
    position: [block.transform.position[0], block.transform.position[1], blockBaseZ(block)] as [number, number, number],
    rotation: block.transform.rotation,
  }));
}

/**
 * 一个作用域里所有节点产出的积木，抬到 `origin` / `rotation` 这一层坐标系。
 *
 * 子层里的坐标本来就相对它所属节点的原点，所以往下走时只需要把那个原点累加进来。
 */
function collectScope(
  project: BlockoutProject,
  scopeId: string | null,
  path: string[],
  namePath: string[],
  origin: Vec2,
  rotation: number,
  visiting: Set<string>,
  depth: number,
  unplaced: string[],
  out: PlacedBlock[],
): void {
  const topology = project.concept;
  if (!topology || depth > MAX_DEPTH) return;
  const scope = scopeId === null ? topology : topology.scopes.find((item) => item.id === scopeId);
  if (!scope) return;

  for (const node of scope.nodes) {
    const local: Vec2 = node.relativePosition ?? [0, 0];
    if (!node.relativePosition) unplaced.push(node.name);
    const ownRotation = node.relativeRotation ?? 0;
    const nodeRotation = rotation + ownRotation;
    // 子层挂在这个节点自己的坐标系里：先按父级朝向把它转出来，再加父级原点
    const [localX, localY] = rotate2d(local[0], local[1], rotation);
    const nodeOrigin: Vec2 = [origin[0] + localX, origin[1] + localY];
    const nodePath = [...path, node.id];
    const nodeNamePath = [...namePath, node.name];

    for (const own of nodeOwnBlocks(node)) {
      // 积木先在节点自己这套坐标里转、再加上节点原点的世界位置
      const [x, y] = rotate2d(own.position[0], own.position[1], ownRotation);
      out.push({
        placementId: node.id,
        path: nodePath,
        namePath: nodeNamePath,
        position: [nodeOrigin[0] + x, nodeOrigin[1] + y, own.position[2]],
        rotation: nodeRotation + own.rotation,
        block: own.block,
      });
    }

    const childScopeId = childScopeIdOf(topology, node.id);
    if (!childScopeId || visiting.has(childScopeId)) continue;
    if (!topology.scopes.some((item) => item.id === childScopeId)) continue;
    collectScope(project, childScopeId, nodePath, nodeNamePath, nodeOrigin, nodeRotation, new Set([...visiting, childScopeId]), depth + 1, unplaced, out);
  }
}

/** 旧数据：模块实例的积木，位置来自 assemblyTransform */
function instancePlacements(project: BlockoutProject): Placement[] {
  const modules = new Map(project.modules.map((module) => [module.id, module]));
  return project.instances.flatMap((instance) => {
    if (!modules.has(instance.definitionId)) return [];
    const path = instance.scopePath?.length ? instance.scopePath : [instance.id];
    return [{ id: instance.id, path, namePath: [instance.name] }];
  });
}

/** 旧数据：实例摆放的积木，摊平成世界坐标 */
function instanceBlocks(project: BlockoutProject): PlacedBlock[] {
  const modules = new Map(project.modules.map((module) => [module.id, module]));
  const nameById = new Map(project.instances.map((instance) => [instance.id, instance.name]));
  const out: PlacedBlock[] = [];
  for (const instance of project.instances) {
    const module = modules.get(instance.definitionId);
    if (!module) continue;
    const path = instance.scopePath?.length ? instance.scopePath : [instance.id];
    const [px, py] = [instance.assemblyTransform.position[0], instance.assemblyTransform.position[1]];
    for (const block of module.blocks) {
      const [x, y] = rotate2d(block.transform.position[0], block.transform.position[1], instance.assemblyTransform.rotation);
      out.push({
        placementId: instance.id,
        path,
        namePath: [...path.map((id) => nameById.get(id) ?? id), instance.name],
        position: [px + x, py + y, instance.assemblyTransform.position[2] + blockBaseZ(block)],
        rotation: instance.assemblyTransform.rotation + block.transform.rotation,
        block,
      });
    }
  }
  return out;
}

/**
 * 某个节点内部的几何（含子层），**坐标相对这个节点自己**。
 *
 * 所以这里刻意不累加节点自己的 `relativePosition` —— 它就是这个坐标系的原点。
 * 换句话说是"把这个节点当成整张图来看"，与 `flattenProjectGeometry` 的算法同一套，
 * 只是起点不同。
 */
export function flattenNodeGeometry(project: BlockoutProject, nodeId: string): FlatGeometry {
  const topology = project.concept;
  const node = topology ? scopesOf(topology).flatMap((scope) => scope.nodes).find((item) => item.id === nodeId) : undefined;
  if (!topology || !node) return { placements: [], blocks: [], unplaced: [] };

  const ownRotation = node.relativeRotation ?? 0;
  const unplaced: string[] = [];
  const blocks: PlacedBlock[] = [];

  // 把"这个节点"本身当成根作用域里的一个节点来走一遍：原点在 [0,0]。
  // 这里要**摘掉 childScopeId**，否则会顺着它递归，子层就会被算两遍
  // （下面那段才是子层该走的路，而且带着节点的朝向）。
  const { childScopeId: _own, ...bare } = node;
  collectScope(
    { ...project, concept: { ...topology, nodes: [{ ...bare, relativePosition: [0, 0] }] } },
    null,
    [],
    [],
    [0, 0],
    0,
    new Set(),
    0,
    unplaced,
    blocks,
  );

  const childScopeId = childScopeIdOf(topology, node.id);
  if (childScopeId && topology.scopes.some((item) => item.id === childScopeId)) {
    collectScope(project, childScopeId, [node.id], [node.name], [0, 0], ownRotation, new Set([childScopeId]), 0, unplaced, blocks);
  }

  const placements = [...new Map(blocks.map((placed) => [placed.placementId, { id: placed.placementId, path: placed.path, namePath: placed.namePath }])).values()];
  return { placements, blocks, unplaced };
}

/**
 * 整张图的展平几何。**3D 预览与 UE 导出的唯一入口。**
 *
 * `graphPosition` 是画布排版坐标，在这里绝不出现。
 */
export function flattenProjectGeometry(project: BlockoutProject): FlatGeometry {
  if (!project.concept) {
    const blocks = instanceBlocks(project);
    return { placements: instancePlacements(project), blocks, unplaced: [] };
  }

  const blocks: PlacedBlock[] = [];
  const unplaced: string[] = [];
  collectScope(project, null, [], [], [0, 0], 0, new Set(), 0, unplaced, blocks);

  // 一个节点积木都没有时，退回实例摆放。只在整张图都没有节点几何时才退。
  if (blocks.length === 0) {
    const legacy = instanceBlocks(project);
    return { placements: instancePlacements(project), blocks: legacy, unplaced };
  }

  const placements = [...new Map(blocks.map((placed) => [placed.placementId, { id: placed.placementId, path: placed.path, namePath: placed.namePath }])).values()];
  return { placements, blocks, unplaced };
}

/** 能导入 UE 的积木：过滤口径只有这一处 */
export function deployableBlocks(geometry: FlatGeometry): PlacedBlock[] {
  return geometry.blocks.filter((placed) => isDeployableBlock(placed.block));
}

/**
 * 同步键里的"路径"段：只取**祖先**，不含摆放自己。
 *
 * 摆放 id 由 `actorSyncKey` 单独拼，而 `path` 的最后一个元素就是它自己 ——
 * 两处都放会让节点 id 在键里出现两次。
 */
export function ancestorPath(placed: PlacedBlock): string[] {
  return placed.path.slice(0, -1);
}
