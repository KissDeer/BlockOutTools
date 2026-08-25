import { getEditorState, subscribeToEditor } from "./editor-store-adapter.js";

const UNIT_LABELS = Object.freeze({
  mm: "mm",
  cm: "cm",
  m: "m",
  inch: "in",
  feet: "ft",
  uu: "UU",
});

function exportScale(level) {
  const value = Number(level.exportScale?.unitsPerPixel);
  const unit = UNIT_LABELS[level.exportScale?.unit] ? level.exportScale.unit : "cm";
  return {
    factor: Number.isFinite(value) && value > 0 ? value : 1,
    unit,
    unitLabel: UNIT_LABELS[unit],
  };
}

function rounded(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

export function formatExportDimension(sourceText, level) {
  const match = /^(R)?(-?\d+(?:\.\d+)?)$/.exec(String(sourceText).trim());
  if (!match) return null;
  const { factor } = exportScale(level);
  return `${match[1] ?? ""}${rounded(Number(match[2]) * factor)}`;
}

export function mountExportDimensionLabels() {
  const legend = document.createElement("div");
  legend.className = "export-dimension-legend";
  legend.dataset.exportDimensionLegend = "true";

  let queued = false;
  const update = () => {
    queued = false;
    const level = getEditorState().level;
    const scale = exportScale(level);
    legend.textContent = `尺寸标注 · x${rounded(scale.factor)} ${scale.unitLabel}`;
    const canvas = document.querySelector("svg[data-canvas-touch]");
    if (!canvas) return;
    const container = canvas.parentElement;
    if (legend.parentElement !== container) container.append(legend);

    for (const text of canvas.querySelectorAll("g.selectable-element text[fill='#10A37F']")) {
      const current = text.textContent.trim();
      const previousSource = text.dataset.layouttoolsSourceDimension;
      const previousRendered = text.dataset.layouttoolsRenderedDimension;
      let source = previousSource;
      if (!source || (current !== previousRendered && current !== previousSource)) {
        source = formatExportDimension(current, { exportScale: { unitsPerPixel: 1, unit: "cm" } }) === null
          ? null
          : current;
      }
      if (!source) continue;
      const rendered = formatExportDimension(source, level);
      text.dataset.layouttoolsSourceDimension = source;
      text.dataset.layouttoolsRenderedDimension = rendered;
      if (current !== rendered) text.textContent = rendered;
    }
  };
  const queueUpdate = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  };
  const observer = new MutationObserver(queueUpdate);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const unsubscribe = subscribeToEditor(queueUpdate);
  queueUpdate();
  return () => {
    observer.disconnect();
    unsubscribe();
    legend.remove();
  };
}
