import { useState } from "react";
import { NumberField } from "../../components/NumberField";
import { fitStairs, stairLandings, surfaceZ, walkingSurfaces } from "../../domain/spatial";
import type { BlockoutProfile, ModuleDefinition, StairsLinearBlock, Vec3 } from "../../domain/types";

export function StairLandingFields({ block, module, profile, onChange }: { block: StairsLinearBlock; module: ModuleDefinition; profile: BlockoutProfile; onChange: (block: StairsLinearBlock) => void }) {
  const initial = stairLandings(block);
  const [lower, setLower] = useState<Vec3>(initial.lower);
  const [upper, setUpper] = useState<Vec3>(initial.upper);
  const [error, setError] = useState("");
  const surfaces = walkingSurfaces(module);
  return <details className="inspector-section">
    <summary>按上下落脚点计算楼梯</summary>
    <p className="field-help">落脚点位于楼梯两端的边缘中点。从楼板取表面高度，再填写连接位置；不会移动楼板。</p>
    {([ ["下落脚点", lower, setLower], ["上落脚点", upper, setUpper] ] as const).map(([label, value, setValue]) => <div key={label}>
      <strong>{label}</strong>
      <select aria-label={`${label}楼板`} value="" onChange={(event) => { const floor = surfaces.find((item) => item.id === event.target.value); if (floor) setValue([value[0], value[1], surfaceZ(floor)]); }}>
        <option value="">从楼板取高度…</option>
        {surfaces.map((floor) => <option key={floor.id} value={floor.id}>{floor.name} · {surfaceZ(floor)}cm</option>)}
      </select>
      {(["X", "Y", "Z"] as const).map((axis, index) => <NumberField key={axis} label={`${label} ${axis}`} value={value[index]} onCommit={(number) => { const next = [...value] as Vec3; next[index] = number; setValue(next); }} />)}
    </div>)}
    <button onClick={() => { try { onChange(fitStairs(block, lower, upper, profile)); setError(""); } catch (failure) { setError(String(failure)); } }}>计算并应用</button>
    <button onClick={() => { const points = stairLandings(block); setLower(points.lower); setUpper(points.upper); }}>读取当前楼梯端点</button>
    {error ? <p role="alert" className="status-warning">{error}</p> : null}
  </details>;
}
