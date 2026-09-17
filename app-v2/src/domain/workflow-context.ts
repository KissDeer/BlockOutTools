/**
 * 资料管理里活下来的那一部分：**同名资料分组**。
 *
 * 这里原来还装着一整套"模块草案上下文"（`resolveModuleContext` / `geometryDigest`）：
 * 拼节点、拼链路、拼钥匙、拼资料，再取一份上下文指纹交给 AI 起稿。
 * 模块层删掉之后那套东西没有下家了 —— 起稿入口（`module-workflow` / `module-draft` /
 * `ModuleContextPanel`）一并被删，**没有调用者的上下文组装就是死代码**，留着只会让人
 * 以为还有一条"AI 起稿"的路。真正与模块无关、且界面上还在用的只有同名分组，
 * 所以只留它；资料现在挂在**逻辑节点**上（`DesignMaterial.nodeIds`），
 * 将来若真要做节点级的上下文，应当按节点重写，而不是把这套旧函数改个名字。
 */

/**
 * 同名资料分组：保留原始顺序，只返回出现两次以上的组。
 * 界面与后续的上下文都用它来标注「同名 1/2」，不猜哪份是当前版本。
 */
export function duplicateMaterialGroups<T extends { name: string }>(materials: T[]): Map<string, T[]> {
  const byName = new Map<string, T[]>();
  for (const material of materials) {
    const group = byName.get(material.name) ?? [];
    group.push(material);
    byName.set(material.name, group);
  }
  for (const [name, group] of byName) if (group.length < 2) byName.delete(name);
  return byName;
}
