import { ArrowRightFromLine, Box, ChartNoAxesColumnIncreasing, DoorOpen } from "lucide-react";
import { CATALOG } from "../../domain/catalog";
import { useProjectStore } from "../../store/project-store";

const icons = {
  box: Box,
  doorway: DoorOpen,
  "stairs-linear": ChartNoAxesColumnIncreasing,
  port: ArrowRightFromLine,
};

export function ModulePalette() {
  const addBlock = useProjectStore((state) => state.addBlock);
  return (
    <div className="sidebar-content">
      <div className="sidebar-heading"><div><span>可部署积木</span><strong>{CATALOG.filter((item) => item.deployable).length}</strong></div><Box size={16} /></div>
      <div className="block-palette">
        {CATALOG.map((item) => {
          const Icon = icons[item.type];
          return (
            <button type="button" key={item.type} onClick={() => addBlock(item.type)}>
              <span className={`palette-icon type-${item.type}`}><Icon size={20} /></span>
              <span><strong>{item.shortLabel}</strong><small>{item.deployable ? "UE Blueprint" : "模块关系"}</small></span>
            </button>
          );
        })}
      </div>
      <div className="sidebar-footnote">Phase 0 先验证 Box、门洞、直梯和出入口。其他 UE 类型将复用同一 Schema 接入。</div>
    </div>
  );
}
