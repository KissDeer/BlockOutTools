import { installAiBlockBridge } from "../layout/ai-block-bridge.js";
import {
  applyBlockParametersToShape,
  createDefaultBlockParameters,
  createPlacedBlock,
  createUnifiedBlockCatalog,
  normalizeBlockParameters,
} from "../layout/block-catalog.js";
import {
  addPlacedBlock,
  getEditorState,
  replacePlacedShape,
  screenToWorld,
  snapToGrid,
  subscribeToEditor,
} from "../layout/editor-store-adapter.js";

const API_ROOT = "/api/ue";

function downloadJson(fileName, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function requestJson(path, options) {
  const response = await fetch(`${API_ROOT}${path}`, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function setBusy(buttons, busy) {
  for (const button of buttons) {
    button.disabled = busy || button.dataset.ready === "false";
  }
}

function fileName(value) {
  return String(value || "LayoutTools").trim().replace(/[^A-Za-z0-9_-]+/g, "_") || "LayoutTools";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function colorToHex(value) {
  const channel = (number) => Math.round(Math.min(1, Math.max(0, Number(number) || 0)) * 255)
    .toString(16).padStart(2, "0");
  return `#${channel(value?.[0])}${channel(value?.[1])}${channel(value?.[2])}`;
}

function hexToColor(value, alpha = 1) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return [0, 0, 0, alpha];
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255).concat(alpha);
}

export function mountUeBridge() {
  if (document.querySelector("[data-ue-bridge]")) {
    return;
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ue-bridge-toggle";
  toggle.dataset.ueBridge = "toggle";
  toggle.setAttribute("aria-label", "打开 Unreal Engine 桥接面板");
  toggle.title = "Unreal Engine 桥接";
  toggle.textContent = "UE";

  const panel = document.createElement("section");
  panel.className = "ue-bridge-panel";
  panel.dataset.ueBridge = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Unreal Engine 桥接");
  panel.innerHTML = `
    <header class="ue-bridge-panel__header">
      <div>
        <strong>MYMY / Unreal</strong>
        <span data-ue-mapping-count>读取映射...</span>
      </div>
      <button type="button" class="ue-bridge-icon-button" data-ue-close aria-label="关闭 Unreal Engine 桥接面板" title="关闭">×</button>
    </header>
    <div class="ue-bridge-status" data-ue-status data-state="loading">
      <span class="ue-bridge-status__dot" aria-hidden="true"></span>
      <span>连接 UE MCP...</span>
    </div>
    <div class="ue-bridge-section ue-block-library">
      <div class="ue-bridge-section__title">放置积木</div>
      <div class="ue-block-tabs" role="group" aria-label="积木来源">
        <button type="button" data-block-filter="all" aria-pressed="true">全部</button>
        <button type="button" data-block-filter="ue" aria-pressed="false">UE 积木</button>
        <button type="button" data-block-filter="original" aria-pressed="false">原有积木</button>
      </div>
      <input class="ue-block-search" type="search" placeholder="搜索名称、类型或 ID" aria-label="搜索积木" data-block-search>
      <div class="ue-block-list" data-block-list aria-label="可放置积木">
        <div class="ue-block-empty">正在读取积木...</div>
      </div>
      <div class="ue-block-placement" data-block-placement>选择积木，然后点击画布放置</div>
    </div>
    <div class="ue-bridge-section ue-block-inspector" data-block-inspector>
      <div class="ue-block-inspector__empty">选择一种 UE 参数化积木，或在画布中选中已放置积木</div>
    </div>
    <div class="ue-bridge-section">
      <div class="ue-bridge-section__title">积木映射</div>
      <button type="button" class="ue-bridge-button" data-ue-palette>下载网页积木模板</button>
      <button type="button" class="ue-bridge-button" data-ue-export>从 UE 导出 JSON</button>
    </div>
    <div class="ue-bridge-section">
      <div class="ue-bridge-section__title">导入 UE</div>
      <input type="file" accept="application/json,.json" data-ue-file hidden>
      <button type="button" class="ue-bridge-button" data-ue-choose>选择 LayoutTools JSON</button>
      <div class="ue-bridge-file" data-ue-file-name>未选择文件</div>
      <div class="ue-bridge-actions">
        <button type="button" class="ue-bridge-button ue-bridge-button--primary" data-ue-dry-run disabled>检查导入</button>
        <button type="button" class="ue-bridge-button ue-bridge-button--danger" data-ue-apply disabled>导入 UE</button>
      </div>
      <label class="ue-bridge-check">
        <input type="checkbox" data-ue-replace>
        <span>替换同名桥接文件夹</span>
      </label>
    </div>
    <output class="ue-bridge-result" data-ue-result aria-live="polite">等待操作</output>
  `;

  document.body.append(toggle, panel);

  const closeButton = panel.querySelector("[data-ue-close]");
  const status = panel.querySelector("[data-ue-status]");
  const statusText = status.querySelector("span:last-child");
  const mappingCount = panel.querySelector("[data-ue-mapping-count]");
  const blockList = panel.querySelector("[data-block-list]");
  const blockSearch = panel.querySelector("[data-block-search]");
  const blockFilters = [...panel.querySelectorAll("[data-block-filter]")];
  const blockPlacement = panel.querySelector("[data-block-placement]");
  const blockInspector = panel.querySelector("[data-block-inspector]");
  const paletteButton = panel.querySelector("[data-ue-palette]");
  const exportButton = panel.querySelector("[data-ue-export]");
  const fileInput = panel.querySelector("[data-ue-file]");
  const chooseButton = panel.querySelector("[data-ue-choose]");
  const fileLabel = panel.querySelector("[data-ue-file-name]");
  const dryRunButton = panel.querySelector("[data-ue-dry-run]");
  const applyButton = panel.querySelector("[data-ue-apply]");
  const replaceInput = panel.querySelector("[data-ue-replace]");
  const result = panel.querySelector("[data-ue-result]");
  const actionButtons = [paletteButton, exportButton, chooseButton, dryRunButton, applyButton];
  let selectedLevel = null;
  let lastPlan = null;
  let blocks = [];
  let blockFilter = "all";
  let selectedBlockId = null;
  let editorUnsubscribe = null;
  const blockDrafts = new Map();

  function selectedParametricShape() {
    try {
      const state = getEditorState();
      const selectedIds = Array.isArray(state.selectedIds) ? state.selectedIds : [];
      return state.level.shapes.find((shape) => selectedIds.includes(shape.id) && shape.ueBlockout?.kind === "parametric");
    } catch {
      return null;
    }
  }

  function inspectorContext() {
    const placementBlock = blocks.find((block) => block.id === selectedBlockId && block.source === "ue");
    if (placementBlock) {
      const values = blockDrafts.get(placementBlock.id) ?? createDefaultBlockParameters(placementBlock);
      blockDrafts.set(placementBlock.id, values);
      return { mode: "placement", block: placementBlock, values };
    }
    const shape = selectedParametricShape();
    const block = blocks.find((item) => item.blockType === shape?.ueBlockout?.blockType);
    if (!shape || !block) return null;
    return { mode: "selection", block, shape, values: shape.ueBlockout.parameters };
  }

  function renderParameterInput(parameter, value) {
    const key = escapeHtml(parameter.key);
    if (parameter.type === "boolean") {
      return `<label class="ue-parameter-toggle"><input type="checkbox" data-parameter-key="${key}" ${value ? "checked" : ""}><span>${escapeHtml(parameter.label)}</span></label>`;
    }
    if (parameter.type === "enum") {
      const options = parameter.options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
      return `<label class="ue-parameter-field"><span>${escapeHtml(parameter.label)}</span><select data-parameter-key="${key}">${options}</select></label>`;
    }
    if (parameter.type === "color") {
      return `<label class="ue-parameter-field ue-parameter-field--color"><span>${escapeHtml(parameter.label)}</span><input type="color" data-parameter-key="${key}" value="${colorToHex(value)}"></label>`;
    }
    if (parameter.type === "vector2" || parameter.type === "vector3") {
      const controls = value.map((component, index) => `<label><span>${escapeHtml(parameter.components?.[index] ?? "XYZ"[index])}</span><input type="number" data-parameter-key="${key}" data-parameter-component="${index}" value="${component}" ${Number.isFinite(parameter.min) ? `min="${parameter.min}"` : ""} ${Number.isFinite(parameter.max) ? `max="${parameter.max}"` : ""} step="${parameter.step ?? 1}"></label>`).join("");
      return `<fieldset class="ue-parameter-vector"><legend>${escapeHtml(parameter.label)}${parameter.unit ? ` · ${escapeHtml(parameter.unit)}` : ""}</legend><div>${controls}</div></fieldset>`;
    }
    const inputType = ["number", "integer"].includes(parameter.type) ? "number" : "text";
    return `<label class="ue-parameter-field"><span>${escapeHtml(parameter.label)}${parameter.unit ? ` · ${escapeHtml(parameter.unit)}` : ""}</span><input type="${inputType}" data-parameter-key="${key}" value="${escapeHtml(value)}" ${Number.isFinite(parameter.min) ? `min="${parameter.min}"` : ""} ${Number.isFinite(parameter.max) ? `max="${parameter.max}"` : ""} ${inputType === "number" ? `step="${parameter.step ?? 1}"` : ""}></label>`;
  }

  function renderInspector() {
    const context = inspectorContext();
    if (!context) {
      blockInspector.innerHTML = '<div class="ue-block-inspector__empty">选择一种 UE 参数化积木，或在画布中选中已放置积木</div>';
      return;
    }
    const geometry = context.block.parameters.map((parameter) => renderParameterInput(parameter, context.values[parameter.key])).join("");
    const commonGroups = context.block.commonParameters.reduce((groups, parameter) => {
      const group = parameter.group ?? "通用";
      const values = groups.get(group) ?? [];
      values.push(parameter);
      groups.set(group, values);
      return groups;
    }, new Map());
    const common = [...commonGroups].map(([group, parameters]) => `
      <details class="ue-parameter-group">
        <summary>${escapeHtml(group)}</summary>
        <div>${parameters.map((parameter) => renderParameterInput(parameter, context.values[parameter.key])).join("")}</div>
      </details>
    `).join("");
    blockInspector.innerHTML = `
      <header class="ue-block-inspector__header">
        <img src="${escapeHtml(context.block.icon)}" alt="">
        <div><strong>${escapeHtml(context.block.label)}</strong><span>${escapeHtml(context.block.form)} · ${context.mode === "placement" ? "放置参数" : "已放置积木"}</span></div>
      </header>
      <code class="ue-block-inspector__class">${escapeHtml(context.block.blueprintClassPath)}</code>
      <div class="ue-bridge-section__title">关键几何参数</div>
      <div class="ue-block-inspector__fields">${geometry}</div>
      ${common}
    `;
    blockInspector.dataset.targetMode = context.mode;
    blockInspector.dataset.targetId = context.shape?.id ?? context.block.id;
  }

  function readParameterValue(parameter, input) {
    if (parameter.type === "boolean") return input.checked;
    if (parameter.type === "color") return hexToColor(input.value);
    if (parameter.type === "vector2" || parameter.type === "vector3") {
      const controls = [...blockInspector.querySelectorAll(`[data-parameter-key="${CSS.escape(parameter.key)}"]`)];
      return controls.map((control) => Number(control.value));
    }
    if (["number", "integer"].includes(parameter.type)) return Number(input.value);
    return input.value;
  }

  function setPanelOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }

  function showResult(message, state = "idle") {
    result.textContent = message;
    result.dataset.state = state;
  }

  function renderBlocks() {
    const query = blockSearch.value.trim().toLocaleLowerCase();
    const visible = blocks.filter((block) => {
      if (blockFilter !== "all" && block.source !== blockFilter) return false;
      const haystack = `${block.label} ${block.blockType ?? block.id} ${block.form ?? ""}`.toLocaleLowerCase();
      return !query || haystack.includes(query);
    });

    if (visible.length === 0) {
      blockList.innerHTML = '<div class="ue-block-empty">没有匹配的积木</div>';
      return;
    }

    blockList.innerHTML = visible.map((block) => `
      <button type="button" class="ue-block-item" data-block-id="${block.id}" aria-pressed="${block.id === selectedBlockId}" ${block.available === false ? "disabled" : ""}>
        ${block.source === "ue"
    ? `<img class="ue-block-item__icon" src="${escapeHtml(block.icon)}" alt="">`
    : `<span class="ue-block-item__glyph" data-shape="${block.shapeType ?? "entity"}" aria-hidden="true"></span>`}
        <span class="ue-block-item__copy">
          <strong>${block.label}</strong>
          <small>${block.source === "ue" ? `UE 参数化 · ${block.form}` : "LayoutTools 原有"}</small>
        </span>
      </button>
    `).join("");
  }

  function cancelPlacement() {
    selectedBlockId = null;
    delete document.body.dataset.blockPlacementArmed;
    blockPlacement.textContent = "选择积木，然后点击画布放置";
    blockPlacement.dataset.state = "idle";
    renderBlocks();
    renderInspector();
  }

  function armPlacement(blockId) {
    const block = blocks.find((item) => item.id === blockId);
    if (!block) return;
    selectedBlockId = block.id;
    document.body.dataset.blockPlacementArmed = "true";
    blockPlacement.textContent = `已选择 ${block.label} · 点击画布连续放置 · Esc 取消`;
    blockPlacement.dataset.state = "active";
    renderBlocks();
    renderInspector();
  }

  toggle.addEventListener("click", () => setPanelOpen(panel.hidden));
  closeButton.addEventListener("click", () => setPanelOpen(false));
  chooseButton.addEventListener("click", () => fileInput.click());
  blockSearch.addEventListener("input", renderBlocks);
  for (const filterButton of blockFilters) {
    filterButton.addEventListener("click", () => {
      blockFilter = filterButton.dataset.blockFilter;
      for (const button of blockFilters) {
        button.setAttribute("aria-pressed", String(button === filterButton));
      }
      renderBlocks();
    });
  }
  blockList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-block-id]");
    if (!button) return;
    if (button.dataset.blockId === selectedBlockId) {
      cancelPlacement();
    } else {
      armPlacement(button.dataset.blockId);
    }
  });
  function handleParameterEdit(event, renderAfter) {
    const input = event.target.closest("[data-parameter-key]");
    const context = inspectorContext();
    if (!input || !context) return;
    const definition = [...context.block.parameters, ...context.block.commonParameters]
      .find((parameter) => parameter.key === input.dataset.parameterKey);
    if (!definition) return;
    const changed = {
      ...context.values,
      [definition.key]: readParameterValue(definition, input),
    };
    const normalized = normalizeBlockParameters(context.block, changed);
    if (context.mode === "placement") {
      blockDrafts.set(context.block.id, normalized);
    } else {
      replacePlacedShape(context.shape.id, (shape) => applyBlockParametersToShape(shape, context.block, normalized));
    }
    if (renderAfter) renderInspector();
  }
  blockInspector.addEventListener("input", (event) => handleParameterEdit(event, false));
  blockInspector.addEventListener("change", (event) => handleParameterEdit(event, true));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedBlockId) cancelPlacement();
  });
  window.addEventListener("layouttools:ai-normalization-warning", (event) => {
    const count = event.detail?.warnings?.length ?? 0;
    if (count > 0) showResult(`AI 结果中有 ${count} 个未知 UE 积木，已按原有形状保留`, "warning");
  });
  document.addEventListener("pointerdown", (event) => {
    if (!selectedBlockId || event.button !== 0) return;
    if (event.target.closest?.("button, input, select, textarea, [data-ue-bridge]")) return;
    const svg = document.querySelector("svg[data-canvas-touch]");
    if (!svg) return;
    const canvasRect = svg.getBoundingClientRect();
    const isInsideCanvas = event.clientX >= canvasRect.left
      && event.clientX <= canvasRect.right
      && event.clientY >= canvasRect.top
      && event.clientY <= canvasRect.bottom;
    if (!isInsideCanvas) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const state = getEditorState();
      const block = blocks.find((item) => item.id === selectedBlockId);
      const point = snapToGrid(screenToWorld(svg, event.clientX, event.clientY), state.level.gridSize);
      const parameters = block.source === "ue" ? blockDrafts.get(block.id) : undefined;
      const placed = createPlacedBlock(block, point, state.activeLayerId, parameters);
      addPlacedBlock(placed);
      blockPlacement.textContent = `已放置 ${block.label} (${Math.round(point.x)}, ${Math.round(point.y)}) · 可继续点击`;
      blockPlacement.dataset.state = "success";
    } catch (error) {
      blockPlacement.textContent = error.message;
      blockPlacement.dataset.state = "error";
    }
  }, true);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    selectedLevel = null;
    lastPlan = null;
    applyButton.disabled = true;
    if (!file) {
      fileLabel.textContent = "未选择文件";
      dryRunButton.disabled = true;
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.shapes) || !Array.isArray(parsed.layers) || !Array.isArray(parsed.entities)) {
        throw new Error("不是有效的 LayoutTools JSON");
      }
      selectedLevel = parsed;
      fileLabel.textContent = `${file.name} · ${parsed.shapes.length} 个形状`;
      dryRunButton.disabled = false;
      showResult("文件已就绪", "success");
    } catch (error) {
      fileLabel.textContent = file.name;
      dryRunButton.disabled = true;
      showResult(error.message, "error");
    }
  });

  dryRunButton.addEventListener("click", async () => {
    if (!selectedLevel) return;
    setBusy(actionButtons, true);
    showResult("正在生成导入计划...", "loading");
    try {
      lastPlan = await requestJson("/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: selectedLevel, mode: "dry-run" }),
      });
      applyButton.disabled = lastPlan.actorCount === 0;
      const warningText = lastPlan.warnings.length > 0 ? ` · ${lastPlan.warnings.length} 条警告` : "";
      showResult(`${lastPlan.actorCount} 个 UE Actor${warningText}`, lastPlan.warnings.length ? "warning" : "success");
    } catch (error) {
      showResult(error.message, "error");
    } finally {
      setBusy(actionButtons, false);
      dryRunButton.disabled = !selectedLevel;
      applyButton.disabled = !lastPlan || lastPlan.actorCount === 0;
    }
  });

  applyButton.addEventListener("click", async () => {
    if (!selectedLevel || !lastPlan) return;
    const replaceText = replaceInput.checked ? "，并替换同名桥接文件夹中的 Actor" : "";
    if (!window.confirm(`将向 MYMY 当前关卡创建 ${lastPlan.actorCount} 个 Actor${replaceText}。继续吗？`)) {
      return;
    }
    setBusy(actionButtons, true);
    showResult("正在导入 UE...", "loading");
    try {
      const payload = await requestJson("/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: selectedLevel,
          mode: "apply",
          confirmProjectName: "MYMY",
          replaceExisting: replaceInput.checked,
        }),
      });
      const { created, removed, errors } = payload.applyResult;
      showResult(`已创建 ${created.length} · 已替换 ${removed.length} · 失败 ${errors.length}`, errors.length ? "warning" : "success");
    } catch (error) {
      showResult(error.message, "error");
    } finally {
      setBusy(actionButtons, false);
      dryRunButton.disabled = !selectedLevel;
      applyButton.disabled = !lastPlan || lastPlan.actorCount === 0;
    }
  });

  paletteButton.addEventListener("click", async () => {
    setBusy(actionButtons, true);
    showResult("正在读取 UE 积木...", "loading");
    try {
      const payload = await requestJson("/palette");
      downloadJson(`${fileName(payload.level.name)}.json`, payload.level);
      showResult(`已生成 ${payload.level.shapes.length} 个一一对应积木`, payload.warnings.length ? "warning" : "success");
    } catch (error) {
      showResult(error.message, "error");
    } finally {
      setBusy(actionButtons, false);
      dryRunButton.disabled = !selectedLevel;
      applyButton.disabled = !lastPlan || lastPlan.actorCount === 0;
    }
  });

  exportButton.addEventListener("click", async () => {
    setBusy(actionButtons, true);
    showResult("正在读取桥接 Actor...", "loading");
    try {
      const payload = await requestJson("/export");
      downloadJson(`${fileName(payload.level.name)}.json`, payload.level);
      showResult(`已导出 ${payload.level.shapes.length} 个形状`, payload.warnings.length ? "warning" : "success");
    } catch (error) {
      showResult(error.message, "error");
    } finally {
      setBusy(actionButtons, false);
      dryRunButton.disabled = !selectedLevel;
      applyButton.disabled = !lastPlan || lastPlan.actorCount === 0;
    }
  });

  const mappingRequest = requestJson("/mapping");
  void mappingRequest
    .then((mappingPayload) => {
      mappingCount.textContent = `${mappingPayload.parametricBlockCount} 类参数化积木`;
      blocks = createUnifiedBlockCatalog(mappingPayload.parametricBlocks);
      installAiBlockBridge(blocks);
      renderBlocks();
      renderInspector();
      editorUnsubscribe ??= subscribeToEditor(() => {
        if (!selectedBlockId && !blockInspector.contains(document.activeElement)) renderInspector();
      });
    })
    .catch((error) => {
      blockList.innerHTML = `<div class="ue-block-empty">积木目录读取失败：${error.message}</div>`;
    });

  void requestJson("/status")
    .then((statusPayload) => {
      const projectMatches = statusPayload.projectMatches && statusPayload.projectPathMatches;
      status.dataset.state = projectMatches ? "success" : "warning";
      statusText.textContent = projectMatches
        ? `${statusPayload.editor.project_name} · UE ${statusPayload.editor.engine_version}`
        : `项目不匹配：${statusPayload.editor.project_file}`;
    })
    .catch((error) => {
      status.dataset.state = "error";
      statusText.textContent = `UE MCP 未连接：${error.message}`;
    });
}
