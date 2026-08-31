import {
  alignSelection,
  distributeSelection,
  moveSelection,
  resizeSingleSelection,
  rotateSelection,
  selectionBounds,
  snapSelection,
} from "./editor-workflow-model.js";
import { getEditorState, subscribeToEditor } from "./editor-store-adapter.js";

const DEFAULT_SETTINGS = Object.freeze({ moveKey: "w", rotateKey: "e", scaleKey: "r", gridSnap: true });

function metadata(level) {
  const value = level.editorWorkflow ?? {};
  return {
    groups: Array.isArray(value.groups) ? value.groups : [],
    lockedIds: Array.isArray(value.lockedIds) ? value.lockedIds : [],
    isolationIds: Array.isArray(value.isolationIds) ? value.isolationIds : [],
    search: String(value.search ?? ""),
    settings: { ...DEFAULT_SETTINGS, ...(value.settings ?? {}) },
  };
}

function commit(level, selectedIds) {
  const state = getEditorState();
  state.setLevel(level);
  state.addToHistory(level);
  state.setSelectedIds(selectedIds);
}

function selectionIds() {
  return [...(getEditorState().selectedIds ?? [])];
}

function editableTarget(target) {
  return target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
}

function createId() {
  return globalThis.crypto?.randomUUID ? `edit-group-${globalThis.crypto.randomUUID()}` : `edit-group-${Date.now()}`;
}

export function mountEditorWorkflowPanel() {
  if (document.querySelector("[data-editor-workflow]")) return;
  const toolbar = document.createElement("section");
  toolbar.className = "editor-workflow-toolbar";
  toolbar.dataset.editorWorkflow = "";
  toolbar.hidden = true;
  toolbar.innerHTML = `
    <div class="editor-workflow-modes" role="group" aria-label="变换模式">
      <button type="button" data-edit-mode="move" aria-pressed="true">W 移动</button>
      <button type="button" data-edit-mode="rotate" aria-pressed="false">E 旋转</button>
      <button type="button" data-edit-mode="scale" aria-pressed="false">R 缩放</button>
    </div>
    <div class="editor-workflow-numbers" data-edit-numbers></div>
    <div class="editor-workflow-actions">
      <button type="button" data-edit-snap="grid" aria-pressed="true">网格</button>
      <button type="button" data-edit-snap="vertex">顶点 V</button>
      <button type="button" data-edit-snap="surface">贴边</button>
      <button type="button" data-edit-group>成组</button>
      <button type="button" data-edit-ungroup>解组</button>
      <button type="button" data-edit-lock>锁定</button>
      <button type="button" data-edit-unlock-all>解锁全部</button>
      <button type="button" data-edit-isolate>隔离</button>
      <button type="button" data-edit-align="x">对齐 X</button>
      <button type="button" data-edit-align="y">对齐 Y</button>
      <button type="button" data-edit-distribute="x">分布 X</button>
      <button type="button" data-edit-distribute="y">分布 Y</button>
    </div>
    <label class="editor-workflow-search"><span>筛选</span><input type="search" data-edit-search placeholder="名称 / ID / 积木类型"></label>
    <details class="editor-workflow-shortcuts"><summary>快捷键</summary><div>
      <label>移动<input maxlength="1" data-shortcut="moveKey"></label>
      <label>旋转<input maxlength="1" data-shortcut="rotateKey"></label>
      <label>缩放<input maxlength="1" data-shortcut="scaleKey"></label>
    </div></details>`;
  document.body.append(toolbar);

  const numbers = toolbar.querySelector("[data-edit-numbers]");
  const search = toolbar.querySelector("[data-edit-search]");
  let mode = "move";
  let selecting = false;
  let visualFrame = 0;

  function writeMetadata(changes, recordHistory = true) {
    const state = getEditorState();
    const next = { ...state.level, editorWorkflow: { ...metadata(state.level), ...changes } };
    state.setLevel(next);
    if (recordHistory) state.addToHistory(next);
    return next;
  }

  function renderNumbers() {
    const state = getEditorState();
    const bounds = selectionBounds(state.level, state.selectedIds);
    if (!bounds) {
      numbers.innerHTML = '<span class="editor-workflow-empty">未选择</span>';
      return;
    }
    if (mode === "move") numbers.innerHTML = `<label>X<input type="number" step="1" data-transform="x" value="${bounds.centerX.toFixed(1)}"></label><label>Y<input type="number" step="1" data-transform="y" value="${bounds.centerY.toFixed(1)}"></label>`;
    if (mode === "rotate") numbers.innerHTML = '<label>角度<input type="number" step="1" data-transform="rotation" value="0"></label>';
    if (mode === "scale") numbers.innerHTML = `<label>宽<input type="number" step="1" data-transform="width" value="${bounds.width.toFixed(1)}"></label><label>高<input type="number" step="1" data-transform="height" value="${bounds.height.toFixed(1)}"></label>`;
  }

  function render() {
    const state = getEditorState();
    const info = metadata(state.level);
    toolbar.hidden = document.body.dataset.moduleEditActive !== "true";
    search.value = info.search;
    toolbar.querySelector('[data-edit-snap="grid"]').setAttribute("aria-pressed", String(info.settings.gridSnap));
    for (const input of toolbar.querySelectorAll("[data-shortcut]")) input.value = info.settings[input.dataset.shortcut];
    for (const button of toolbar.querySelectorAll("[data-edit-mode]")) button.setAttribute("aria-pressed", String(button.dataset.editMode === mode));
    const ids = state.selectedIds ?? [];
    toolbar.querySelector("[data-edit-lock]").textContent = ids.length > 0 && ids.every((id) => info.lockedIds.includes(id)) ? "解锁" : "锁定";
    toolbar.querySelector("[data-edit-isolate]").textContent = info.isolationIds.length ? "退出隔离" : "隔离";
    renderNumbers();
    scheduleVisuals();
  }

  function scheduleVisuals() {
    cancelAnimationFrame(visualFrame);
    visualFrame = requestAnimationFrame(applyVisuals);
  }

  function applyVisuals() {
    const state = getEditorState();
    const info = metadata(state.level);
    const query = info.search.trim().toLocaleLowerCase();
    const isolated = new Set(info.isolationIds);
    const locked = new Set(info.lockedIds);
    const items = [
      ...(state.level.shapes ?? []).filter((item) => item.layerId === state.activeLayerId),
      ...(state.level.entities ?? []).filter((item) => item.layerId === state.activeLayerId),
    ];
    const elements = [...document.querySelectorAll("svg[data-canvas-touch] .selectable-element")];
    elements.slice(0, items.length).forEach((element, index) => {
      const item = items[index];
      const haystack = `${item.name ?? ""} ${item.label ?? ""} ${item.id} ${item.ueBlockout?.blockType ?? ""}`.toLocaleLowerCase();
      const hidden = (isolated.size > 0 && !isolated.has(item.id)) || (query && !haystack.includes(query));
      element.style.display = hidden ? "none" : "";
      element.style.pointerEvents = locked.has(item.id) ? "none" : "";
      element.style.opacity = locked.has(item.id) ? "0.45" : "";
    });
  }

  function setMode(nextMode) {
    mode = nextMode;
    getEditorState().setActiveTool("select");
    render();
  }

  function transformFromInputs() {
    const state = getEditorState();
    const ids = selectionIds();
    const values = Object.fromEntries([...numbers.querySelectorAll("[data-transform]")].map((input) => [input.dataset.transform, Number(input.value)]));
    const info = metadata(state.level);
    const grid = info.settings.gridSnap ? Number(state.level.gridSize) : 0;
    let next = state.level;
    if (mode === "move") next = moveSelection(next, ids, values, grid);
    if (mode === "rotate") next = rotateSelection(next, ids, values.rotation);
    if (mode === "scale") next = resizeSingleSelection(next, ids, values.width, values.height, grid);
    commit(next, ids);
  }

  function modifySelection(action) {
    const state = getEditorState();
    const ids = selectionIds();
    if (ids.length === 0) return;
    const info = metadata(state.level);
    if (action === "group") {
      writeMetadata({ groups: [...info.groups.filter((group) => !group.itemIds.some((id) => ids.includes(id))), { id: createId(), name: `组 ${info.groups.length + 1}`, itemIds: ids }] });
    }
    if (action === "ungroup") writeMetadata({ groups: info.groups.filter((group) => !group.itemIds.some((id) => ids.includes(id))) });
    if (action === "lock") {
      const unlock = ids.every((id) => info.lockedIds.includes(id));
      writeMetadata({ lockedIds: unlock ? info.lockedIds.filter((id) => !ids.includes(id)) : [...new Set([...info.lockedIds, ...ids])] });
    }
    if (action === "isolate") writeMetadata({ isolationIds: info.isolationIds.length ? [] : ids }, false);
    render();
  }

  toolbar.addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-edit-mode]");
    if (modeButton) return setMode(modeButton.dataset.editMode);
    const snapButton = event.target.closest("[data-edit-snap]");
    if (snapButton) {
      const state = getEditorState();
      const info = metadata(state.level);
      if (snapButton.dataset.editSnap === "grid") writeMetadata({ settings: { ...info.settings, gridSnap: !info.settings.gridSnap } }, false);
      else commit(snapSelection(state.level, selectionIds(), snapButton.dataset.editSnap, Number(state.level.gridSize) * 4), selectionIds());
      return render();
    }
    if (event.target.closest("[data-edit-group]")) return modifySelection("group");
    if (event.target.closest("[data-edit-ungroup]")) return modifySelection("ungroup");
    if (event.target.closest("[data-edit-lock]")) return modifySelection("lock");
    if (event.target.closest("[data-edit-unlock-all]")) {
      writeMetadata({ lockedIds: [] });
      return render();
    }
    if (event.target.closest("[data-edit-isolate]")) return modifySelection("isolate");
    const align = event.target.closest("[data-edit-align]");
    if (align) return commit(alignSelection(getEditorState().level, selectionIds(), align.dataset.editAlign), selectionIds());
    const distribute = event.target.closest("[data-edit-distribute]");
    if (distribute) return commit(distributeSelection(getEditorState().level, selectionIds(), distribute.dataset.editDistribute), selectionIds());
  });
  numbers.addEventListener("change", transformFromInputs);
  search.addEventListener("input", () => {
    writeMetadata({ search: search.value }, false);
    scheduleVisuals();
  });
  toolbar.addEventListener("change", (event) => {
    const input = event.target.closest("[data-shortcut]");
    if (!input) return;
    const info = metadata(getEditorState().level);
    writeMetadata({ settings: { ...info.settings, [input.dataset.shortcut]: input.value.slice(0, 1).toLocaleLowerCase() } }, false);
  });

  document.addEventListener("keydown", (event) => {
    if (toolbar.hidden || editableTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const settings = metadata(getEditorState().level).settings;
    const key = event.key.toLocaleLowerCase();
    const nextMode = key === settings.moveKey ? "move" : key === settings.rotateKey ? "rotate" : key === settings.scaleKey ? "scale" : null;
    if (nextMode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMode(nextMode);
    }
  }, true);

  subscribeToEditor(() => {
    const state = getEditorState();
    const info = metadata(state.level);
    if (!selecting) {
      const locked = new Set(info.lockedIds);
      let ids = (state.selectedIds ?? []).filter((id) => !locked.has(id));
      const group = info.groups.find((candidate) => candidate.itemIds.some((id) => ids.includes(id)));
      if (group) ids = [...new Set([...ids, ...group.itemIds.filter((id) => !locked.has(id))])];
      if (JSON.stringify(ids) !== JSON.stringify(state.selectedIds ?? [])) {
        selecting = true;
        state.setSelectedIds(ids);
        selecting = false;
      }
    }
    render();
  });
  window.addEventListener("layouttools:module-edit-state", render);
  render();
}
