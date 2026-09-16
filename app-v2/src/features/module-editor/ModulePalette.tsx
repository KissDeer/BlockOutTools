import { ArrowRightFromLine, Box, ChartNoAxesColumnIncreasing, DoorOpen } from "lucide-react";
import { CATALOG } from "../../domain/catalog";
import { useProjectStore } from "../../store/project-store";

const icons = {
  box: Box,
  doorway: DoorOpen,
  "stairs-linear": ChartNoAxesColumnIncreasing,
  port: ArrowRightFromLine,
};
const labels = { box: "盒体", doorway: "门洞", "stairs-linear": "直梯", port: "出入口" };

export function ModulePalette() {
  const addBlock = useProjectStore((state) => state.addBlock);
  return (
    <div className="sidebar-content">
      <div className="sidebar-heading"><div><span>手工添加积木</span><strong>{CATALOG.length}</strong></div><Box size={16} /></div>
      <div className="block-palette">
        {CATALOG.map((item) => {
          const Icon = icons[item.type];
          return (
            <button type="button" key={item.type} aria-label={`添加${labels[item.type]}`} title={`添加${labels[item.type]}`} onClick={() => addBlock(item.type)}>
              <span className={`palette-icon type-${item.type}`}><Icon size={20} /></span>
              <span><strong>{labels[item.type]}</strong></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
