import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import { NumberField } from "../../components/NumberField";
import { TextField } from "../../components/TextField";
import { createId } from "../../domain/ids";
import { interpretDiagram } from "../../domain/diagram-import";
import { downloadJson } from "../../domain/persistence";
import type { DiagramReference, ModuleDefinition } from "../../domain/types";
import { useProjectStore } from "../../store/project-store";

export function ReferenceUnderlay({ reference }: { reference: DiagramReference }) {
  const [image, setImage] = useState<HTMLImageElement>();
  useEffect(() => { const next = new window.Image(); next.onload = () => setImage(next); next.src = reference.imageData; return () => { next.onload = null; }; }, [reference.imageData]);
  return reference.visible && image ? <KonvaImage image={image} x={reference.origin[0]} y={reference.origin[1]} width={reference.pixelSize[0] * reference.cmPerPixel} height={reference.pixelSize[1] * reference.cmPerPixel} rotation={reference.rotation} opacity={reference.opacity} listening={false} /> : null;
}

export function ReferenceTools({ module }: { module: ModuleDefinition }) {
  const updateModule = useProjectStore((state) => state.updateModule);
  const profile = useProjectStore((state) => state.project.blockoutProfile);
  const imageInput = useRef<HTMLInputElement>(null);
  const dataInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pixelDistance, setPixelDistance] = useState(100);
  const [realDistance, setRealDistance] = useState(1000);
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<(ReturnType<typeof interpretDiagram> & { baseRevision: number }) | null>(null);
  const reference = module.reference;
  function patch(patch: Partial<DiagramReference>) { if (reference) updateModule({ ...module, reference: { ...reference, ...patch } }); }
  return <>
    <button onClick={() => setOpen(!open)}>图纸底图</button>
    <input className="sr-only" ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setError("底图请限制在 10MB 以内"); return; }
      try {
        const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        const image = new window.Image(); image.src = data; await image.decode();
        updateModule({ ...module, reference: { id: createId("reference"), name: file.name, imageData: data, pixelSize: [image.width, image.height], origin: [0, 0], cmPerPixel: 1, rotation: 0, opacity: 0.45, visible: true, confirmed: false, legend: "" } });
        setError(""); setCandidate(null);
      } catch { setError("图片读取失败"); }
    }} />
    <input className="sr-only" ref={dataInput} type="file" accept=".json" onChange={async (event) => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
      if (!file || !reference) return;
      try { setCandidate({ ...interpretDiagram(JSON.parse(await file.text()), module, reference, profile), baseRevision: module.revision }); setError(""); }
      catch (failure) { setError(String(failure)); }
    }} />
    {open ? <section className="utility-panel" role="dialog" aria-label="图纸底图">
      <header><strong>模块底图与图纸解释</strong><button onClick={() => setOpen(false)}>关闭</button></header>
      <button onClick={() => imageInput.current?.click()}>选择 PNG / JPG / WebP</button>
      {reference ? <>
        <p>{reference.name}</p>
        <code className="object-id">sourceId: {reference.id}<br />moduleId: {module.id}</code>
        <label><input type="checkbox" checked={reference.visible} onChange={(event) => patch({ visible: event.target.checked })} />显示底图</label>
        <NumberField label="原点 X" value={reference.origin[0]} onCommit={(value) => patch({ origin: [value, reference.origin[1]] })} />
        <NumberField label="原点 Y" value={reference.origin[1]} onCommit={(value) => patch({ origin: [reference.origin[0], value] })} />
        <NumberField label="底图旋转" value={reference.rotation} unit="°" onCommit={(rotation) => patch({ rotation })} />
        <NumberField label="已知线段像素长度" value={pixelDistance} min={0.01} unit="px" onCommit={setPixelDistance} />
        <NumberField label="该线段真实长度" value={realDistance} min={0.01} onCommit={setRealDistance} />
        <button onClick={() => patch({ cmPerPixel: realDistance / pixelDistance, confirmed: true })}>应用比例校准</button>
        <p className="field-help">{reference.cmPerPixel.toFixed(4)} cm/px · {reference.confirmed ? "已确认比例" : "比例待确认"}。校准只移动底图，已有积木不会被缩放。</p>
        <NumberField label="底图透明度" value={reference.opacity} min={0} step={0.1} unit="" onCommit={(opacity) => patch({ opacity: Math.min(1, opacity) })} />
        <TextField label="图例与尺寸依据" value={reference.legend} onCommit={(legend) => patch({ legend })} />
        <button onClick={() => dataInput.current?.click()}>读取图纸解释 JSON</button>
        <button onClick={() => downloadJson(module.interpretation ?? { schemaVersion: 1, sourceId: reference.id, moduleId: module.id, elements: [{ id: "floor-main", name: "主楼板", kind: "floor", polygon: [[0, 0], [100, 0], [100, 100], [0, 100]], holes: [], elevation: 0, thickness: 40, confirmed: false, note: "示例坐标，请按原图修改" }] }, "module-interpretation.json")}>导出解释文件 / 模板</button>
        {candidate ? <div><p>新增 {candidate.added} · 修改 {candidate.changed} · 移除旧分块 {candidate.removed} · 保留其余 {candidate.retained} 个积木。修改项会替换同一特征对应的已有积木。</p><details><summary>查看候选积木</summary>{candidate.module.blocks.filter((block) => block.provenance?.sourceId === reference.id).map((block) => <p key={block.id}>{block.name} · {block.type} · XYZ {block.transform.position.map((n) => n.toFixed(1)).join(", ")} · {block.transform.rotation.toFixed(1)}°</p>)}</details><button onClick={() => { if (module.revision !== candidate.baseRevision) { setError("模块已变化，请重新读取候选文件"); return; } updateModule(candidate.module); setCandidate(null); }}>接受当前模块（可撤销）</button><button onClick={() => setCandidate(null)}>取消候选</button></div> : null}
      </> : null}
      <p className="field-help">每个模块单独校准。矢量图、PDF 请先按比例导出底图，再按解释文件记录轮廓与尺寸。路线不会生成墙，内部楼梯由两个落脚点生成。</p>
      {error ? <p role="alert" className="status-warning">{error}</p> : null}
    </section> : null}
  </>;
}
