export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * UE 同步键：`projectId / 节点路径… / 摆放 id / blockId`。
 *
 * 路径段让"两个鬼屋里各自一块同名楼板"在键上就能区分，也便于从键直接看出它属于哪里；
 * 摆放 id 就是节点 id，所以**给节点改名不会改变键**（改名不产生重复 Actor）。
 * 根层节点没有路径段，键与最初的扁平格式一致。
 */
export function actorSyncKey(projectId: string, placementId: string, blockId: string, scopePath: string[] = []): string {
  const prefix = scopePath.length ? `${scopePath.join("/")}/` : "";
  return `${projectId}/${prefix}${placementId}/${blockId}`;
}
