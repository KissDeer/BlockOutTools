import { ArrowRightFromLine, Box, ChartNoAxesColumnIncreasing, DoorOpen, Trash2 } from "lucide-react";
import { NumberField } from "../../components/NumberField";
import { TextField } from "../../components/TextField";
import type { Block, Rgba, Vec3 } from "../../domain/types";
import { useProjectStore } from "../../store/project-store";
import { StairLandingFields } from "./StairLandingFields";
import { blockBaseZ, surfaceZ } from "../../domain/spatial";

const typeInfo = {
  box: { label: "Box 盒体", Icon: Box, status: "UE Blueprint" },
  doorway: { label: "Doorway 门洞", Icon: DoorOpen, status: "UE Blueprint" },
  "stairs-linear": { label: "Stairs Linear", Icon: ChartNoAxesColumnIncreasing, status: "UE Blueprint" },
  port: { label: "模块出入口", Icon: ArrowRightFromLine, status: "不导入 UE" },
};

function rgbaToHex(color: Rgba): string {
  return `#${color.slice(0, 3).map((part) => Math.round(part * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgba(hex: string): Rgba {
  return [Number.parseInt(hex.slice(1, 3), 16) / 255, Number.parseInt(hex.slice(3, 5), 16) / 255, Number.parseInt(hex.slice(5, 7), 16) / 255, 1];
}

export function BlockInspector() {
  const project = useProjectStore((state) => state.project);
  const activeInstanceId = useProjectStore((state) => state.activeInstanceId);
  const activeModuleId = useProjectStore((state) => state.activeModuleId);
  const selectedIds = useProjectStore((state) => state.selectedBlockIds);
  const updateBlock = useProjectStore((state) => state.updateBlock);
  const remove = useProjectStore((state) => state.deleteSelectedBlocks);
  const instance = project.instances.find((item) => item.id === activeInstanceId);
  // 从阶段一的逻辑节点进入模块时没有实例，直接按 activeModuleId 解析
  const module = project.modules.find((item) => item.id === activeModuleId) ?? project.modules.find((item) => item.id === instance?.definitionId);
  const block = selectedIds.length === 1 ? module?.blocks.find((item) => item.id === selectedIds[0]) : null;

  if (!block) return <div className="empty-inspector"><span>{selectedIds.length > 1 ? `已选择 ${selectedIds.length} 个积木` : "未选择积木"}</span><small>选择一个积木编辑 Transform 和关键参数</small></div>;
  const info = typeInfo[block.type];
  const Icon = info.Icon;

  function patch(mutator: (next: Block) => void) {
    const next = structuredClone(block!);
    mutator(next);
    updateBlock(next);
  }

  function patchPosition(index: 0 | 1 | 2, value: number) {
    patch((next) => { const position = [...next.transform.position] as Vec3; position[index] = value; next.transform.position = position; });
  }

  return (
    <div className="inspector-content">
      <header className="inspector-heading type-heading">
        <span><Icon size={16} />{info.label}</span>
        <strong>{block.name}</strong>
        <small className={block.type === "port" ? "non-deployable" : "deployable"}>{info.status}</small>
      </header>
      <section className="inspector-section">
        <h3>对象</h3>
        <TextField label="名称" value={block.name} onCommit={(value) => patch((next) => { next.name = value; })} />
      </section>
      <section className="inspector-section">
        <h3>Transform</h3>
        <div className="field-grid two-columns">
          <NumberField label="X" value={block.transform.position[0]} onCommit={(value) => patchPosition(0, value)} />
          <NumberField label="Y" value={block.transform.position[1]} onCommit={(value) => patchPosition(1, value)} />
          <NumberField label="Z" value={block.transform.position[2]} onCommit={(value) => patchPosition(2, value)} />
          <NumberField label="旋转" value={block.transform.rotation} unit="°" step={15} onCommit={(value) => patch((next) => { next.transform.rotation = value; })} />
        </div>
      </section>
      <section className="inspector-section">
        <h3>关键参数</h3>
        {block.type === "box" ? (
          <>
            <label>用途<select value={block.role ?? "solid"} onChange={(event) => patch((next) => { if (next.type === "box") next.role = event.target.value as typeof next.role; })}><option value="solid">普通实体</option><option value="floor">楼板</option><option value="landing">落脚平台</option><option value="wall">墙壁</option><option value="edging">包边</option></select></label>
            <label>高度基准<select value={block.elevationReference ?? "bottom"} onChange={(event) => patch((next) => { if (next.type !== "box") return; const z = event.target.value === "surface" ? surfaceZ(next) : blockBaseZ(next); next.elevationReference = event.target.value as "bottom" | "surface"; next.transform.position[2] = z; })}><option value="bottom">底面 Z（兼容旧积木）</option><option value="surface">行走表面 Z（厚度向下）</option></select></label>
            <Vector3Fields labels={["长度 X", "宽度 Y", "高度 Z"]} value={block.parameters.BoxSize} onCommit={(value) => patch((next) => { if (next.type === "box") next.parameters.BoxSize = value; })} />
          </>
        ) : null}
        {block.type === "doorway" ? (
          <>
            <Vector3Fields labels={["墙厚 X", "洞宽 Y", "洞高 Z"]} value={block.parameters.DoorwaySize} onCommit={(value) => patch((next) => { if (next.type === "doorway") next.parameters.DoorwaySize = value; })} />
            <NumberField label="顶部厚度" value={block.parameters.TopThickness} min={0} step={5} onCommit={(value) => patch((next) => { if (next.type === "doorway") next.parameters.TopThickness = value; })} />
            <NumberField label="侧边厚度" value={block.parameters.SideThickness} min={0} step={5} onCommit={(value) => patch((next) => { if (next.type === "doorway") next.parameters.SideThickness = value; })} />
          </>
        ) : null}
        {block.type === "stairs-linear" ? (
          <>
            <Vector3Fields labels={["宽度 X", "进深 Y", "高度 Z"]} value={block.parameters.StairsSize} onCommit={(value) => patch((next) => { if (next.type === "stairs-linear") next.parameters.StairsSize = value; })} />
            <NumberField label="台阶数" value={block.parameters.NumberOfSteps} min={1} step={1} unit="级" onCommit={(value) => patch((next) => { if (next.type === "stairs-linear") next.parameters.NumberOfSteps = Math.round(value); })} />
            <StairLandingFields key={block.id} block={block} module={module!} profile={project.blockoutProfile} onChange={updateBlock} />
            {block.parameters.StairsType !== "BOX" ? <p className="status-warning">{block.parameters.StairsType} 的 UE 形态尚未核实，预览仅显示 BOX 近似，请勿据此验收。</p> : null}
          </>
        ) : null}
        {block.type === "port" ? (
          <>
            <NumberField label="箭头长度" value={block.parameters.depth} min={10} onCommit={(value) => patch((next) => { if (next.type === "port") next.parameters.depth = value; })} />
            <NumberField label="通行宽度" value={block.parameters.width} min={10} onCommit={(value) => patch((next) => { if (next.type === "port") next.parameters.width = value; })} />
          </>
        ) : null}
      </section>
      {block.type !== "port" ? (
        <section className="inspector-section">
          <h3>白盒颜色</h3>
          <div className="color-fields">
            <label><span>主体</span><input type="color" value={rgbaToHex(block.parameters.blockout_material_color)} onChange={(event) => patch((next) => { if (next.type !== "port") next.parameters.blockout_material_color = hexToRgba(event.target.value); })} /></label>
            <label><span>顶面</span><input type="color" value={rgbaToHex(block.parameters.blockout_material_top_color)} onChange={(event) => patch((next) => { if (next.type !== "port") next.parameters.blockout_material_top_color = hexToRgba(event.target.value); })} /></label>
          </div>
        </section>
      ) : null}
      <div className="inspector-commands"><button type="button" className="danger-command" onClick={remove}><Trash2 size={15} />删除积木</button></div>
      <code className="object-id">{block.id}</code>
    </div>
  );
}

function Vector3Fields({ labels, value, onCommit }: { labels: [string, string, string]; value: Vec3; onCommit: (value: Vec3) => void }) {
  return (
    <div className="field-grid">
      {labels.map((label, index) => (
        <NumberField key={label} label={label} value={value[index]} min={1} onCommit={(nextValue) => {
          const next = [...value] as Vec3;
          next[index] = nextValue;
          onCommit(next);
        }} />
      ))}
    </div>
  );
}
