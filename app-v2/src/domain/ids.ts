export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * UE 同步键：projectId / 层级路径… / moduleInstanceId / blockId。
 * 路径段让"两个鬼屋里的同名积木"在键上就能区分，也便于从键直接看出它属于哪里。
 * 扁平项目没有路径段，键与旧格式一致。
 */
export function actorSyncKey(projectId: string, instanceId: string, blockId: string, scopePath: string[] = []): string {
  const prefix = scopePath.length ? `${scopePath.join("/")}/` : "";
  return `${projectId}/${prefix}${instanceId}/${blockId}`;
}
