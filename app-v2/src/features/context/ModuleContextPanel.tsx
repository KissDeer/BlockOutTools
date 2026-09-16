import { useMemo, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { LOGIC_KINDS, NODE_ROLES } from "../../domain/concept";
import { resolveModuleContext } from "../../domain/workflow-context";
import { useProjectStore } from "../../store/project-store";
import { MaterialManager } from "./MaterialManager";
import "./context.css";

export function ModuleContextPanel({ moduleId }: { moduleId: string }) {
  const project = useProjectStore((state) => state.project);
  const context = useMemo(() => resolveModuleContext(project, moduleId), [project, moduleId]);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const pinned = context.materials.find((item) => item.id === pinnedId);
  const scopes = project.concept ? [project.concept, ...project.concept.scopes] : [];
  const nodeNames = new Map(scopes.flatMap((scope) => scope.nodes.map((node) => [node.id, node.name] as const)));
  const nodeModules = new Map(scopes.flatMap((scope) => scope.modules.flatMap((group) => group.nodeIds.map((id) => [id, group.name] as const))));
  const memberIds = new Set(context.nodes.map((node) => node.id));
  const ports = project.modules.find((item) => item.id === moduleId)?.blocks.filter((block) => block.type === "port") ?? [];
  const instanceCount = project.instances.filter((instance) => instance.definitionId === moduleId).length;

  function saveBrief(field: "purpose" | "goals", value: string) {
    const state = useProjectStore.getState();
    const module = state.project.modules.find((item) => item.id === moduleId);
    if (!module || state.project.projectId !== project.projectId) return;
    const inherited = resolveModuleContext(state.project, moduleId);
    const brief = module.designBrief ?? { purpose: inherited.purpose, goals: inherited.goals };
    if (brief[field] !== value) state.updateModule({ ...module, designBrief: { ...brief, [field]: value } });
  }

  function linkDescription(link: typeof context.internalLinks[number]) {
    return `${nodeNames.get(link.from) ?? link.from} ${link.traversal === "both" ? "↔" : "→"} ${nodeNames.get(link.to) ?? link.to}`;
  }

  function keyRequirement(keyId: string | null) {
    if (!keyId) return "";
    const key = context.keys.find((item) => item.id === keyId);
    return key ? ` · 需要${key.name}（${nodeNames.get(key.foundAt) ?? "其他区域"}取得）` : " · 锁钥条件待核对";
  }

  function externalRequirement(link: typeof context.externalLinks[number]) {
    const neighborId = memberIds.has(link.from) ? link.to : link.from;
    const target = nodeModules.get(neighborId) ?? "未归属区域";
    const portExists = ports.some((port) => port.provenance?.sourceId === context.sourceId && port.provenance.featureId === link.id);
    return `连接到${target} · ${portExists ? "已有接口端口，实际对接待核对" : "待补接口端口"}`;
  }

  return <section className="module-context-panel" aria-label="当前模块上下文">
    <header><span className="context-eyebrow">当前模块参考</span><h2>{context.moduleName}</h2><p className="context-muted">{context.nodes.length} 个区域 · {context.externalLinks.length} 个对外接口需求{instanceCount > 1 ? ` · 共用定义影响 ${instanceCount} 个实例` : ""}</p></header>
    <div className="context-section">
      <label>设计目的<textarea key={`purpose:${moduleId}:${context.purpose}`} rows={2} aria-label="模块设计目的" defaultValue={context.purpose} placeholder="这个模块承担什么体验？" onBlur={(event) => saveBrief("purpose", event.target.value)} /></label>
      <label>达成目标<textarea key={`goals:${moduleId}:${context.goals}`} rows={3} aria-label="模块达成目标" defaultValue={context.goals} placeholder="希望玩家经历的节奏、探索或战斗目标" onBlur={(event) => saveBrief("goals", event.target.value)} /></label>
    </div>
    <div className="context-image-columns">
      {(["structure", "mood"] as const).map((kind) => <section key={kind}><h3>{kind === "structure" ? "结构图" : "氛围图"}</h3>
        {context.materials.filter((item) => item.kind === kind).length === 0 ? <p className="context-empty">暂无{kind === "structure" ? "结构" : "氛围"}参考</p> : null}
        {context.materials.filter((item) => item.kind === kind).map((item) => <figure key={item.id}>
          {item.imageData ? <button type="button" className="context-thumbnail" onClick={() => setPinnedId(pinnedId === item.id ? null : item.id)} aria-label={`放大固定 ${item.name}`}><img src={item.imageData} alt={item.name} /><Maximize2 size={13} /></button> : <span className="context-missing-image">原图缺失</span>}
          <figcaption>{item.name}<small>{item.source}</small></figcaption>{item.text ? <p>{item.text}</p> : null}
        </figure>)}
      </section>)}
    </div>
    <MaterialManager key={`${project.projectId}:${moduleId}`} moduleId={moduleId} />
    <section className="context-section"><h3>当前要求</h3>
      {context.goal ? <p><small>继承 · 项目目标</small>{context.goal}</p> : null}
      {context.constraints ? <p className="context-rule"><small>继承 · 项目硬约束</small>{context.constraints}</p> : null}
      {context.materials.filter((item) => item.kind === "rules" || item.kind === "note").map((item) => <p key={item.id}><small>{item.source} · {item.name}</small>{item.text}{item.imageData ? <button type="button" className="context-action" onClick={() => setPinnedId(item.id)}>查看附图</button> : null}</p>)}
      {!context.goal && !context.constraints && !context.materials.some((item) => item.kind === "rules" || item.kind === "note") ? <p className="context-muted">可直接开始搭建，资料与要求随时补充。</p> : null}
      {context.warnings.map((warning, index) => <p className="context-warning" key={`${index}:${warning}`}>{warning}</p>)}
    </section>
    <section className="context-section"><h3>区域与意图</h3>{context.nodes.length ? context.nodes.map((node) => <p key={node.id}><strong>{node.name}</strong><small>{NODE_ROLES[node.role]} · 楼层 {node.floor}{node.elevation ? ` · 标高 ${node.elevation.base}–${node.elevation.top} cm` : ""}</small>{node.note || "尚未补充区域备注"}</p>) : <p className="context-muted">此定义尚未关联拓扑区域，可手工搭建。</p>}</section>
    <section className="context-section"><h3>内部通路 · {context.internalLinks.length}</h3>{context.internalLinks.map((link) => <p key={link.id}><strong>{linkDescription(link)}</strong><small>{LOGIC_KINDS[link.logic].label}{link.traversal === "one-time" ? " · 一次性通行" : ""}{keyRequirement(link.requires)}</small>{link.note}</p>)}{!context.internalLinks.length ? <p className="context-muted">暂无内部链路要求</p> : null}</section>
    <section className="context-section"><h3>对外接口 · {context.externalLinks.length}</h3>{context.externalLinks.map((link) => <p key={link.id}><strong>{linkDescription(link)}</strong><small>{LOGIC_KINDS[link.logic].label} · {link.traversal === "both" ? "双向" : link.traversal === "one-time" ? "一次性" : "单向"}{keyRequirement(link.requires)}</small><small>{externalRequirement(link)}</small>{link.note || "方位与实际对接需在搭建中确认"}</p>)}{!context.externalLinks.length ? <p className="context-muted">暂无对外链路要求</p> : null}</section>
    {pinned?.imageData ? <aside className="context-image-pin" aria-label={`固定参考图：${pinned.name}`}><header><strong>{pinned.name}</strong><button type="button" aria-label="关闭固定参考图" onClick={() => setPinnedId(null)}><X size={16} /></button></header><img src={pinned.imageData} alt={pinned.name} /><p>{pinned.text || pinned.source}</p></aside> : null}
  </section>;
}
