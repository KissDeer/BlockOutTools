export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function actorSyncKey(projectId: string, instanceId: string, blockId: string): string {
  return `${projectId}/${instanceId}/${blockId}`;
}
