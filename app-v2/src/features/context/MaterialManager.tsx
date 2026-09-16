import { useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { createId } from "../../domain/ids";
import { duplicateMaterialGroups } from "../../domain/workflow-context";
import type { DesignMaterial } from "../../domain/types";
import { useProjectStore } from "../../store/project-store";

const KIND_LABELS = { structure: "结构图", mood: "氛围图", rules: "规则与约束", note: "设计说明" };

export function MaterialManager({ moduleId }: { moduleId: string | null }) {
  const project = useProjectStore((state) => state.project);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<DesignMaterial["kind"]>("structure");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [imageData, setImageData] = useState("");
  const [target, setTarget] = useState<"module" | "project">(moduleId ? "module" : "project");
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<string | null>(null);
  const identity = useRef(`${project.projectId}:${moduleId}`);
  identity.current = `${project.projectId}:${moduleId}`;
  const module = project.modules.find((item) => item.id === moduleId);
  const materials = project.designContext?.materials ?? [];
  const duplicateGroups = useMemo(() => duplicateMaterialGroups(materials), [materials]);
  /** 同名资料的序号标签；不重名时返回空串 */
  function variantOf(id: string) {
    for (const group of duplicateGroups.values()) {
      const index = group.findIndex((item) => item.id === id);
      if (index >= 0) return `同名 ${index + 1}/${group.length}`;
    }
    return "";
  }

  async function readFile(file: File) {
    const requestIdentity = identity.current;
    const editingId = imageTarget.current;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setStatus("请使用 PNG、JPEG 或 WebP 图片"); return; }
    if (file.size > 8_000_000) { setStatus("单张图片请控制在 8 MB 内"); return; }
    setReading(true);
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
      const image = new window.Image(); image.src = result; await image.decode();
      if (identity.current !== requestIdentity) return;
      if (editingId) {
        editMaterial(editingId, "imageData", result);
        setStatus(`已更新原图：${file.name}；所有关联模块同步使用，可撤销`);
        return;
      }
      setImageData(result); setName((current) => current || file.name); setStatus(`已选择 ${file.name}`);
    } catch { if (identity.current === requestIdentity) setStatus("图片读取失败，请重试"); }
    finally { if (identity.current === requestIdentity) setReading(false); }
  }

  function saveMaterial() {
    const state = useProjectStore.getState();
    if (state.project.projectId !== project.projectId || !name.trim() || (!text.trim() && !imageData)) return;
    const context = state.project.designContext ?? { goal: "", constraints: "", materials: [] };
    const material: DesignMaterial = { id: createId("material"), name: name.trim(), kind, text, imageData, moduleIds: target === "module" && moduleId ? [moduleId] : [] };
    state.acceptProject({ ...state.project, designContext: { ...context, materials: [...context.materials, material] }, updatedAt: new Date().toISOString() });
    setName(""); setText(""); setImageData(""); setStatus("资料已保存"); setAdding(false);
  }

  function assignMaterial(id: string, nextIds: string[]) {
    const state = useProjectStore.getState();
    const context = state.project.designContext;
    if (state.project.projectId !== project.projectId || !context) return;
    state.acceptProject({ ...state.project, designContext: { ...context, materials: context.materials.map((item) => item.id === id ? { ...item, moduleIds: nextIds } : item) }, updatedAt: new Date().toISOString() });
  }

  function editMaterial(id: string, field: "name" | "text" | "imageData", value: string) {
    const state = useProjectStore.getState();
    const context = state.project.designContext;
    if (state.project.projectId !== project.projectId || !context || (field === "name" && !value.trim())) return;
    const current = context.materials.find((item) => item.id === id);
    if (!current || current[field] === value) return;
    state.acceptProject({ ...state.project, designContext: { ...context, materials: context.materials.map((item) => item.id === id ? { ...item, [field]: value } : item) }, updatedAt: new Date().toISOString() });
  }

  function removeMaterial(id: string) {
    const state = useProjectStore.getState();
    const context = state.project.designContext;
    if (state.project.projectId !== project.projectId || !context) return;
    const material = context.materials.find((item) => item.id === id);
    if (!material) return;
    // 原文件只存一份，删除会同时影响所有关联模块，所以说明影响面
    const affected = material.moduleIds.length;
    state.acceptProject({ ...state.project, designContext: { ...context, materials: context.materials.filter((item) => item.id !== id) }, updatedAt: new Date().toISOString() });
    setConfirmDelete(null);
    setStatus(affected
      ? `已删除“${material.name}”，${affected} 个关联模块不再引用它；可用撤销恢复`
      : `已删除项目级资料“${material.name}”；可用撤销恢复`);
  }

  return <div className="material-manager">
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readFile(file); }} />
    <button type="button" className="context-action" onClick={() => setAdding((value) => !value)} aria-expanded={adding}><Plus size={13} />添加到{module?.name ?? "整个项目"}</button>
    {adding ? <div className="context-material-form">
      <label>归属<select value={target} onChange={(event) => setTarget(event.target.value as "module" | "project")} aria-label="新资料归属">
        {moduleId ? <option value="module">当前模块：{module?.name}</option> : null}<option value="project">整个项目（所有模块可见）</option>
      </select></label>
      <label>类型<select value={kind} onChange={(event) => setKind(event.target.value as DesignMaterial["kind"])}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>资料名称<input aria-label="资料名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>说明<textarea aria-label="资料说明" rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="说明图片中应参考的部分，或直接填写文字要求" /></label>
      <div className="context-actions"><button type="button" onClick={() => { imageTarget.current = null; fileRef.current?.click(); }} disabled={reading}><ImagePlus size={13} />{imageData ? "更换图片" : "选择图片"}</button><button type="button" disabled={reading || !name.trim() || (!text.trim() && !imageData)} onClick={saveMaterial}>保存资料</button></div>
      {imageData ? <img className="material-upload-preview" src={imageData} alt="待保存的资料" /> : null}
    </div> : null}
    {materials.length > 0 ? <details className="context-material-sharing"><summary>关联已有资料 · {materials.length} 份{duplicateGroups.size ? ` · ${duplicateGroups.size} 组同名` : ""}</summary>
      <p className="context-muted">同一份资料可关联多个模块，原图仅保存一份。</p>
      {duplicateGroups.size ? <p className="context-warning">有同名资料：无法自动判断哪份是当前版本，请核对后删除旧版。</p> : null}
      {materials.map((material) => <div className={`material-sharing-row${variantOf(material.id) ? " is-duplicate" : ""}`} key={material.id}>
        <strong>{material.name}{variantOf(material.id) ? <em className="material-variant">{variantOf(material.id)}</em> : null}</strong><span className="context-muted">{KIND_LABELS[material.kind]}</span>
        <details className="context-material-form"><summary>编辑资料 · 所有关联模块同步</summary><label>名称<input key={`name:${material.name}`} defaultValue={material.name} onBlur={(event) => editMaterial(material.id, "name", event.target.value)} /></label><label>说明<textarea key={`text:${material.text}`} rows={2} defaultValue={material.text} onBlur={(event) => editMaterial(material.id, "text", event.target.value)} /></label><button type="button" disabled={reading} onClick={() => { imageTarget.current = material.id; fileRef.current?.click(); }}>{material.imageData ? "更换原图" : "补充原图"}</button></details>
        {confirmDelete === material.id
          ? <span className="material-delete-confirm">
            <button type="button" className="context-danger" onClick={() => removeMaterial(material.id)}>确认删除</button>
            <button type="button" onClick={() => setConfirmDelete(null)}>取消</button>
          </span>
          : <button type="button" className="context-action" onClick={() => setConfirmDelete(material.id)}><Trash2 size={13} />删除</button>}
        <label className="context-checkbox"><input type="checkbox" checked={material.moduleIds.length === 0} onChange={(event) => assignMaterial(material.id, event.target.checked ? [] : [moduleId ?? project.modules[0]?.id].filter((id): id is string => Boolean(id)))} disabled={project.modules.length === 0} />整个项目</label>
        {project.modules.map((item) => <label key={item.id} className="context-checkbox"><input type="checkbox" checked={material.moduleIds.includes(item.id)} onChange={(event) => {
          const next = event.target.checked ? [...material.moduleIds, item.id] : material.moduleIds.filter((id) => id !== item.id);
          if (!next.length) { setStatus("至少关联一个模块；若需全项目共用，请选择“整个项目”"); return; }
          assignMaterial(material.id, next);
        }} />{item.name}</label>)}
      </div>)}
    </details> : null}
    {status ? <p className="context-status" role="status">{status}</p> : null}
  </div>;
}
