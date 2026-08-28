import {
  CONNECTION_TYPES,
  connectModulePorts,
  connectionType,
  createEmptyStructureModule,
  createModuleFromLayer,
  createModuleInstance,
  disconnectModulePorts,
  layerBounds,
  materializeModulePortShapes,
  removeModuleInstance,
  removeStructureModule,
  structureGraph,
  syncModulePortsFromShapes,
  updateConnectionWaypoints,
  updateStructureAssembly,
  updateStructureModule,
  worldPort,
} from "./structure-module-model.js";
import {
  getEditorState,
  subscribeToEditor,
} from "./editor-store-adapter.js";
import { decorateModulePortShapes } from "./module-port-visual.js";
import { createStructurePreview3d } from "./structure-preview-3d.js";

const EXPLODED_Z_FACTOR = 0.45;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2.5;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(finite(value));
}

function safeColor(value, fallback) {
  const color = String(value ?? "").trim();
  return /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color) ? color : fallback;
}

function rotatePoint(point, degrees) {
  const radians = finite(degrees) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: finite(point.x) * cosine - finite(point.y) * sine,
    y: finite(point.x) * sine + finite(point.y) * cosine,
  };
}

function connectionEndpointKey(endpoint) {
  return `${endpoint.instanceId}:${endpoint.portId}`;
}

function numberField(label, field, value, step = 10) {
  return `
    <label class="structure-field">
      <span>${label}</span>
      <input type="number" step="${step}" value="${escapeHtml(value)}" data-${field}>
    </label>
  `;
}

function shapeMarkup(shape, module) {
  const defaultFill = shape.isStairs ? "#b88336" : "#77827d";
  const fill = safeColor(shape.color ?? shape.fill, defaultFill);
  const opacity = Math.max(0.12, Math.min(1, finite(shape.opacity, 0.78)));
  if (Array.isArray(shape.wallCenterline) && shape.wallCenterline.length > 1) {
    const points = shape.wallCenterline
      .map((point) => `${finite(point.x) - module.origin.x},${finite(point.y) - module.origin.y}`)
      .join(" ");
    const thickness = Math.max(4, finite(shape.wallThickness ?? shape.strokeWidth, 12));
    return `<polyline points="${points}" fill="none" stroke="#111513" stroke-width="${thickness}" stroke-linecap="square" stroke-linejoin="miter" vector-effect="non-scaling-stroke"/>`;
  }
  if (shape.type === "circle") {
    return `<circle cx="${finite(shape.x) - module.origin.x}" cy="${finite(shape.y) - module.origin.y}" r="${Math.abs(finite(shape.radius, 40))}" fill="${fill}" fill-opacity="${opacity}" stroke="#c5cdc8" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }
  const points = shape.points ?? shape.vertices ?? shape.polygonPoints;
  if (Array.isArray(points) && points.length > 2) {
    const value = points
      .map((point) => `${finite(point.x) - module.origin.x},${finite(point.y) - module.origin.y}`)
      .join(" ");
    return `<polygon points="${value}" fill="${fill}" fill-opacity="${opacity}" stroke="#c5cdc8" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }
  const width = Math.max(1, Math.abs(finite(shape.width, 80)));
  const height = Math.max(1, Math.abs(finite(shape.height, 80)));
  const x = finite(shape.x) - module.origin.x;
  const y = finite(shape.y) - module.origin.y;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const rotation = finite(shape.rotation);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1" fill="${fill}" fill-opacity="${opacity}" stroke="#c5cdc8" stroke-width="1" vector-effect="non-scaling-stroke" transform="rotate(${rotation} ${centerX} ${centerY})"/>`;
}

function entityMarkup(entity, module) {
  const position = entity.position ?? entity;
  const x = finite(position.x) - module.origin.x;
  const y = finite(position.y) - module.origin.y;
  return `<path d="M ${x} ${y - 8} L ${x + 8} ${y} L ${x} ${y + 8} L ${x - 8} ${y} Z" fill="#5db79a" stroke="#e4fff5" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
}

function instanceProjection(instance, previewMode) {
  return {
    x: finite(instance.transform.x),
    y: finite(instance.transform.y) - (previewMode === "exploded" ? finite(instance.transform.z) * EXPLODED_Z_FACTOR : 0),
  };
}

function portProjection(graph, endpoint, previewMode) {
  const port = worldPort(graph, endpoint);
  return {
    ...port,
    displayX: port.x,
    displayY: port.y - (previewMode === "exploded" ? port.z * EXPLODED_Z_FACTOR : 0),
  };
}

function connectionDisplayPoints(connection, from, to, previewMode) {
  const waypoints = Array.isArray(connection.waypoints) ? connection.waypoints : [];
  return [from, ...waypoints.map((point, index) => {
    const progress = (index + 1) / (waypoints.length + 1);
    const interpolatedZ = from.z + (to.z - from.z) * progress;
    return {
      x: finite(point.x),
      y: finite(point.y),
      displayX: finite(point.x),
      displayY: finite(point.y) - (previewMode === "exploded" ? interpolatedZ * EXPLODED_Z_FACTOR : 0),
    };
  }), to];
}

function connectionPath(points) {
  return points.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.displayX} ${point.displayY}`
  )).join(" ");
}

function polylineMidpoint(points) {
  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: Math.hypot(point.displayX - points[index].displayX, point.displayY - points[index].displayY),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (total < 0.01) return { x: points[0].displayX + 58, y: points[0].displayY };
  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const progress = segment.length > 0 ? remaining / segment.length : 0;
      return {
        x: segment.from.displayX + (segment.to.displayX - segment.from.displayX) * progress,
        y: segment.from.displayY + (segment.to.displayY - segment.from.displayY) * progress,
      };
    }
    remaining -= segment.length;
  }
  const last = points.at(-1);
  return { x: last.displayX, y: last.displayY };
}

function nearestSegmentIndex(points, point) {
  let closestIndex = 0;
  let closestDistance = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
      : 0;
    const nearestX = from.x + dx * progress;
    const nearestY = from.y + dy * progress;
    const distance = Math.hypot(point.x - nearestX, point.y - nearestY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }
  return closestIndex;
}

function endpointLabel(graph, endpoint) {
  const instance = graph.instances.find((candidate) => candidate.id === endpoint.instanceId);
  const module = instance && graph.modules.find((candidate) => candidate.id === instance.moduleId);
  const port = module?.ports.find((candidate) => candidate.id === endpoint.portId);
  return `${instance?.name ?? "未知实例"} / ${port?.name ?? "未知出入口"}`;
}

export function mountStructureModulePanel() {
  if (document.querySelector("[data-structure-modules]")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "structure-module-toggle";
  toggle.dataset.structureModules = "toggle";
  toggle.title = "楼层模块组装";
  toggle.setAttribute("aria-label", "打开楼层模块组装");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "模块";

  const panel = document.createElement("section");
  panel.className = "structure-module-panel";
  panel.dataset.structureModules = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "楼层模块组装工作台");
  panel.innerHTML = `
    <header class="structure-header">
      <div class="structure-title">
        <strong>楼层模块组装</strong>
        <span data-structure-summary>0 个模块 · 0 个实例</span>
      </div>
      <div class="structure-header-actions">
        <button type="button" class="structure-icon-button" data-structure-fit aria-label="适应全部模块" title="适应全部模块">⌾</button>
        <button type="button" class="structure-icon-button" data-structure-close aria-label="关闭楼层模块组装" title="关闭">×</button>
      </div>
    </header>
    <div class="structure-toolbar">
      <button type="button" class="structure-command structure-command--primary" data-structure-new>新增模块</button>
      <button type="button" class="structure-command" data-structure-import>从当前图层导入</button>
      <button type="button" class="structure-command" data-structure-reuse disabled>复用实例</button>
      <button type="button" class="structure-command structure-preview-toggle" data-preview-toggle aria-expanded="false" aria-controls="structure-preview-drawer">3D 预览</button>
      <div class="structure-segmented" aria-label="预览方式">
        <button type="button" data-preview-mode="plan" aria-pressed="true">平面</button>
        <button type="button" data-preview-mode="exploded" aria-pressed="false">层高展开</button>
      </div>
    </div>
    <div class="structure-workspace">
      <aside class="structure-sidebar" data-structure-sidebar></aside>
      <main class="structure-canvas-shell">
        <svg class="structure-canvas" data-structure-canvas aria-label="模块组装画布">
          <defs>
            <pattern id="structure-grid-small" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#2d3431" stroke-width="0.8"/>
            </pattern>
            <pattern id="structure-grid-large" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="url(#structure-grid-small)"/>
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#414a46" stroke-width="1.2"/>
            </pattern>
            <marker id="structure-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="context-stroke"/>
            </marker>
          </defs>
          <rect class="structure-grid" x="-100000" y="-100000" width="200000" height="200000"/>
          <g data-structure-world></g>
        </svg>
        <output class="structure-status" data-structure-status data-state="idle" aria-live="polite">就绪</output>
        <div class="structure-zoom" data-structure-zoom>100%</div>
      </main>
      <aside class="structure-preview" id="structure-preview-drawer" aria-label="三维预览" hidden>
        <header class="structure-preview-header">
          <div><strong>三维预览</strong><small data-preview-state data-state="stale">待刷新</small></div>
          <div class="structure-preview-actions">
            <button type="button" class="structure-command" data-preview-refresh><span aria-hidden="true">↻</span> 刷新预览</button>
            <button type="button" class="structure-icon-button" data-preview-close aria-label="收起三维预览" title="收起三维预览">×</button>
          </div>
        </header>
        <div class="structure-preview-viewport" data-preview-viewport></div>
        <footer class="structure-preview-meta" data-preview-meta>尚未生成预览</footer>
      </aside>
    </div>
  `;

  const editBar = document.createElement("section");
  editBar.className = "structure-module-edit-bar";
  editBar.dataset.moduleEditBar = "";
  editBar.hidden = true;
  editBar.setAttribute("aria-label", "模块内部编辑");
  document.body.append(toggle, panel, editBar);

  const closeButton = panel.querySelector("[data-structure-close]");
  const newButton = panel.querySelector("[data-structure-new]");
  const importButton = panel.querySelector("[data-structure-import]");
  const reuseButton = panel.querySelector("[data-structure-reuse]");
  const fitButton = panel.querySelector("[data-structure-fit]");
  const summary = panel.querySelector("[data-structure-summary]");
  const sidebar = panel.querySelector("[data-structure-sidebar]");
  const canvas = panel.querySelector("[data-structure-canvas]");
  const worldGroup = panel.querySelector("[data-structure-world]");
  const status = panel.querySelector("[data-structure-status]");
  const zoomLabel = panel.querySelector("[data-structure-zoom]");
  const previewButtons = [...panel.querySelectorAll("[data-preview-mode]")];
  const previewToggleButton = panel.querySelector("[data-preview-toggle]");
  const previewCloseButton = panel.querySelector("[data-preview-close]");
  const previewPanel = panel.querySelector(".structure-preview");
  const previewRefreshButton = panel.querySelector("[data-preview-refresh]");
  const previewViewport = panel.querySelector("[data-preview-viewport]");
  const previewState = panel.querySelector("[data-preview-state]");
  const previewMeta = panel.querySelector("[data-preview-meta]");

  let observedLevel = getEditorState().level;
  let selectedModuleId = null;
  let selectedInstanceId = null;
  let selectedPort = null;
  let selectedConnectionId = null;
  let selectedConnectionType = CONNECTION_TYPES[0].id;
  let pendingConnection = null;
  let pendingRoutePoints = [];
  let pendingPointer = null;
  let interactionMode = null;
  let drag = null;
  let previewMode = "plan";
  let previewOpen = false;
  let hasFitted = false;
  let previewRenderer = null;
  let editSession = null;
  let lastInstancePointer = null;
  const camera = { zoom: 0.6, panX: 0, panY: 0 };

  function currentLevel() {
    return getEditorState().level;
  }

  function commitLevel(level, recordHistory = true) {
    const state = getEditorState();
    observedLevel = level;
    state.setLevel(level);
    if (recordHistory) state.addToHistory(level);
    markPreviewStale();
  }

  function showStatus(message, state = "idle") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function ensurePreviewRenderer() {
    if (!previewRenderer) previewRenderer = createStructurePreview3d(previewViewport);
    return previewRenderer;
  }

  function markPreviewStale() {
    previewState.textContent = "待刷新";
    previewState.dataset.state = "stale";
  }

  function refreshPreview() {
    const result = ensurePreviewRenderer().refresh(currentLevel());
    const time = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    previewState.textContent = "已更新";
    previewState.dataset.state = "fresh";
    previewMeta.textContent = `${result.objectCount} 个三维对象 · ${time}`;
    previewMeta.dataset.objectCount = String(result.objectCount);
  }

  function setPreviewOpen(open) {
    previewOpen = Boolean(open);
    previewPanel.hidden = !previewOpen;
    panel.classList.toggle("is-preview-open", previewOpen);
    previewToggleButton.classList.toggle("structure-command--active", previewOpen);
    previewToggleButton.setAttribute("aria-expanded", String(previewOpen));
    previewToggleButton.textContent = previewOpen ? "收起 3D" : "3D 预览";
    renderCanvas();
    if (previewOpen) requestAnimationFrame(() => previewRenderer?.resize());
  }

  function setPanelOpen(open) {
    if (open && editSession) return;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      window.dispatchEvent(new CustomEvent("layouttools:host-panel-open", { detail: "structure" }));
      render();
      requestAnimationFrame(() => {
        if (!hasFitted && structureGraph(currentLevel()).instances.length > 0) fitAll();
      });
    } else {
      interactionMode = null;
      pendingConnection = null;
      pendingRoutePoints = [];
      pendingPointer = null;
      drag = null;
    }
  }

  function selectedGraphContext() {
    const level = currentLevel();
    const graph = structureGraph(level);
    const selectedInstance = graph.instances.find((instance) => instance.id === selectedInstanceId);
    if (selectedInstance) selectedModuleId = selectedInstance.moduleId;
    let selectedModule = graph.modules.find((module) => module.id === selectedModuleId);
    if (!selectedModule) {
      selectedModule = graph.modules[0] ?? null;
      selectedModuleId = selectedModule?.id ?? null;
    }
    let instance = graph.instances.find((candidate) => candidate.id === selectedInstanceId);
    if (!instance && selectedModule) {
      instance = graph.instances.find((candidate) => candidate.moduleId === selectedModule.id) ?? null;
      selectedInstanceId = instance?.id ?? null;
    }
    if (selectedPort) {
      const owner = graph.instances.find((candidate) => candidate.id === selectedPort.instanceId);
      const ownerModule = owner && graph.modules.find((module) => module.id === owner.moduleId);
      if (!ownerModule?.ports.some((port) => port.id === selectedPort.portId)) selectedPort = null;
    }
    if (selectedConnectionId && !graph.connections.some((connection) => connection.id === selectedConnectionId)) {
      selectedConnectionId = null;
    }
    return { level, graph, selectedModule, selectedInstance: instance };
  }

  function renderSidebar(context) {
    const { graph, selectedModule, selectedInstance } = context;
    const moduleById = new Map(graph.modules.map((module) => [module.id, module]));
    const port = selectedPort && moduleById
      .get(graph.instances.find((instance) => instance.id === selectedPort.instanceId)?.moduleId)
      ?.ports.find((candidate) => candidate.id === selectedPort.portId);
    const moduleItems = graph.modules.length > 0
      ? graph.modules.map((module) => {
        const count = graph.instances.filter((instance) => instance.moduleId === module.id).length;
        return `
          <button type="button" class="structure-list-item" data-select-module="${escapeHtml(module.id)}" aria-pressed="${module.id === selectedModuleId}">
            <span>${escapeHtml(module.name)}</span><small>${count} 个实例 · ${module.ports.length} 个出入口</small>
          </button>`;
      }).join("")
      : '<div class="structure-empty">当前文件还没有楼层模块</div>';
    const instanceItems = graph.instances.length > 0
      ? graph.instances.map((instance) => `
          <button type="button" class="structure-list-item structure-list-item--instance" data-select-instance="${escapeHtml(instance.id)}" aria-pressed="${instance.id === selectedInstanceId}">
            <span>${escapeHtml(instance.name)}</span>
            <small>${escapeHtml(moduleById.get(instance.moduleId)?.name ?? "未知模块")} · Z ${formatNumber(instance.transform.z)}</small>
          </button>`).join("")
      : '<div class="structure-empty">没有可组装的实例</div>';

    let inspector = '<div class="structure-empty">选择一个模块实例</div>';
    if (selectedModule && selectedInstance) {
      inspector = `
        <label class="structure-field structure-field--wide">
          <span>模块名称</span>
          <input type="text" value="${escapeHtml(selectedModule.name)}" data-module-name>
        </label>
        <label class="structure-field structure-field--wide">
          <span>实例名称</span>
          <input type="text" value="${escapeHtml(selectedInstance.name)}" data-instance-name>
        </label>
        <div class="structure-coordinate-grid">
          ${numberField("X", "instance-x", selectedInstance.transform.x)}
          ${numberField("Y", "instance-y", selectedInstance.transform.y)}
          ${numberField("Z", "instance-z", selectedInstance.transform.z)}
          ${numberField("旋转", "instance-rotation", selectedInstance.transform.rotation, 15)}
        </div>
        <div class="structure-row-actions">
          <button type="button" class="structure-command structure-command--primary" data-edit-module>编辑内部</button>
          <button type="button" class="structure-icon-button structure-icon-button--danger" data-delete-instance aria-label="删除实例" title="删除实例">×</button>
          <button type="button" class="structure-icon-button structure-icon-button--danger" data-delete-module aria-label="删除模块定义" title="删除模块定义">⌫</button>
        </div>`;
    }
    if (selectedModule && !selectedInstance) {
      inspector = `
        <label class="structure-field structure-field--wide">
          <span>模块名称</span>
          <input type="text" value="${escapeHtml(selectedModule.name)}" data-module-name>
        </label>
        <button type="button" class="structure-command" data-reuse-empty>创建实例</button>`;
    }

    let portInspector = selectedModule?.ports.length
      ? selectedModule.ports.map((candidate) => `
          <button type="button" class="structure-list-item" data-select-published-port="${escapeHtml(candidate.id)}" aria-pressed="${candidate.id === selectedPort?.portId}">
            <span>${escapeHtml(candidate.name)}</span>
            <small>X ${formatNumber(candidate.position.x)} · Y ${formatNumber(candidate.position.y)} · Z ${formatNumber(candidate.position.z)} · ${formatNumber(candidate.facing)}°</small>
          </button>`).join("")
      : '<div class="structure-empty">暂无已公布出入口</div>';
    if (port && selectedPort) {
      portInspector = `
        <div class="structure-published-port">
          <strong>${escapeHtml(port.name)}</strong>
          <span>X ${formatNumber(port.position.x)} · Y ${formatNumber(port.position.y)} · Z ${formatNumber(port.position.z)} · ${formatNumber(port.facing)}°</span>
        </div>
        <button type="button" class="structure-command" data-edit-module>进入内部调整</button>`;
    }

    const connectionItems = graph.connections.length > 0
      ? graph.connections.map((connection) => {
        const type = connectionType(connection.type);
        const direction = type.directional ? " → " : " ↔ ";
        return `
          <div class="structure-connection-item ${connection.id === selectedConnectionId ? "is-selected" : ""}" data-select-connection="${escapeHtml(connection.id)}">
            <div><strong>${escapeHtml(type.label)}</strong><small>${escapeHtml(endpointLabel(graph, connection.from))}${direction}${escapeHtml(endpointLabel(graph, connection.to))}</small></div>
            <button type="button" class="structure-icon-button" data-disconnect="${escapeHtml(connection.id)}" aria-label="断开连接" title="断开连接">×</button>
          </div>`;
      }).join("")
      : '<div class="structure-empty">还没有连接</div>';

    sidebar.innerHTML = `
      <section class="structure-sidebar-section">
        <div class="structure-section-title"><span>模块定义</span><small>${graph.modules.length}</small></div>
        <div class="structure-list">${moduleItems}</div>
      </section>
      <section class="structure-sidebar-section">
        <div class="structure-section-title"><span>组装实例</span><small>${graph.instances.length}</small></div>
        <div class="structure-list structure-list--instances">${instanceItems}</div>
      </section>
      <section class="structure-sidebar-section">
        <div class="structure-section-title"><span>实例变换</span><small>cm / deg</small></div>
        <div class="structure-inspector">${inspector}</div>
      </section>
      <section class="structure-sidebar-section">
        <div class="structure-section-title"><span>已公布出入口</span><small>${selectedModule?.ports.length ?? 0}</small></div>
        <div class="structure-inspector structure-published-ports">${portInspector}</div>
      </section>
      <section class="structure-sidebar-section">
        <div class="structure-section-title"><span>连接形式</span><small>${graph.connections.length}</small></div>
        <div class="structure-connect-controls">
          <select data-connection-type aria-label="连接形式">
            ${CONNECTION_TYPES.map((type) => `<option value="${type.id}" ${type.id === selectedConnectionType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
          </select>
          <button type="button" class="structure-command ${interactionMode === "connect" ? "structure-command--active" : ""}" data-arm-connect>${interactionMode === "connect" ? "取消连接" : "连接出入口"}</button>
        </div>
        <div class="structure-connection-list">${connectionItems}</div>
      </section>`;
  }

  function renderConnection(connection, graph) {
    try {
      const from = portProjection(graph, connection.from, previewMode);
      const to = portProjection(graph, connection.to, previewMode);
      const type = connectionType(connection.type);
      const points = connectionDisplayPoints(connection, from, to, previewMode);
      const path = connectionPath(points);
      const deltaZ = to.z - from.z;
      const verticalMark = type.directional === "vertical" ? (deltaZ >= 0 ? " ↑" : " ↓") : "";
      const zMark = Math.abs(deltaZ) > 0.1 ? ` · ${deltaZ > 0 ? "+" : ""}${formatNumber(deltaZ)}cm` : "";
      const label = polylineMidpoint(points);
      const markerStart = type.arrows === "both" ? 'marker-start="url(#structure-arrow)"' : "";
      const markerEnd = ["both", "end"].includes(type.arrows) ? 'marker-end="url(#structure-arrow)"' : "";
      const waypointHandles = previewMode === "plan"
        ? points.slice(1, -1).map((point, index) => `
            <circle class="structure-route-waypoint" cx="${point.displayX}" cy="${point.displayY}" r="7" data-connection-waypoint="${index}" data-connection-id="${escapeHtml(connection.id)}"/>`).join("")
        : "";
      return `
        <g class="structure-connection ${connection.id === selectedConnectionId ? "is-selected" : ""}" data-connection-id="${escapeHtml(connection.id)}" data-connection-type="${escapeHtml(type.id)}" data-line-style="${escapeHtml(type.lineStyle)}">
          <path class="structure-connection-hit" d="${path}" data-connection-hit="${escapeHtml(connection.id)}"/>
          <path class="structure-connection-line" d="${path}" ${markerStart} ${markerEnd}/>
          ${waypointHandles}
          <circle class="structure-connection-terminal" cx="${from.displayX}" cy="${from.displayY}" r="6"/>
          <circle class="structure-connection-terminal" cx="${to.displayX}" cy="${to.displayY}" r="6"/>
          <text x="${label.x}" y="${label.y - 10}" text-anchor="middle">${escapeHtml(type.shortLabel)}${verticalMark}${escapeHtml(zMark)}</text>
        </g>`;
    } catch {
      return "";
    }
  }

  function renderInstance(instance, module, level, graph, connectedEndpoints) {
    const bounds = layerBounds(level, module.sourceLayerId);
    const localBounds = {
      x: bounds.x - module.origin.x,
      y: bounds.y - module.origin.y,
      width: bounds.width,
      height: bounds.height,
    };
    const projection = instanceProjection(instance, previewMode);
    const rotatedCorners = [
      { x: localBounds.x, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y },
      { x: localBounds.x + localBounds.width, y: localBounds.y + localBounds.height },
      { x: localBounds.x, y: localBounds.y + localBounds.height },
    ].map((point) => rotatePoint(point, instance.transform.rotation));
    const labelX = projection.x + Math.min(...rotatedCorners.map((point) => point.x));
    const labelY = projection.y + Math.min(...rotatedCorners.map((point) => point.y)) - 24;
    const labelWidth = Math.max(110, instance.name.length * 13 + 48);
    const shapes = (level.shapes ?? [])
      .filter((shape) => shape.layerId === module.sourceLayerId && !shape.modulePort)
      .map((shape) => shapeMarkup(shape, module))
      .join("");
    const entities = (level.entities ?? [])
      .filter((entity) => entity.layerId === module.sourceLayerId)
      .map((entity) => entityMarkup(entity, module))
      .join("");
    const ports = module.ports.map((port) => {
      const facing = finite(port.facing);
      const radians = facing * Math.PI / 180;
      const outerX = finite(port.position.x) + Math.cos(radians) * 30;
      const outerY = finite(port.position.y) + Math.sin(radians) * 30;
      const endpoint = { instanceId: instance.id, portId: port.id };
      const isSelected = selectedPort
        && selectedPort.instanceId === instance.id
        && selectedPort.portId === port.id;
      const isPending = pendingConnection
        && pendingConnection.instanceId === instance.id
        && pendingConnection.portId === port.id;
      return `
        <g class="structure-port ${isSelected ? "is-selected" : ""} ${isPending ? "is-pending" : ""} ${connectedEndpoints.has(connectionEndpointKey(endpoint)) ? "is-connected" : ""}" data-port-id="${escapeHtml(port.id)}" data-port-instance-id="${escapeHtml(instance.id)}">
          <line x1="${port.position.x}" y1="${port.position.y}" x2="${outerX}" y2="${outerY}"/>
          <circle cx="${port.position.x}" cy="${port.position.y}" r="9"/>
          <path class="structure-port-direction" d="M -8 -7 L 7 0 L -8 7 Z" transform="translate(${outerX} ${outerY}) rotate(${facing})"/>
          <g class="structure-port-label" transform="translate(${port.position.x} ${port.position.y}) rotate(${-finite(instance.transform.rotation)})">
            <text x="0" y="-14" text-anchor="middle">${escapeHtml(port.name)}</text>
          </g>
        </g>`;
    }).join("");
    return `
      <g class="structure-instance ${instance.id === selectedInstanceId ? "is-selected" : ""}" data-instance-id="${escapeHtml(instance.id)}" transform="translate(${projection.x} ${projection.y}) rotate(${finite(instance.transform.rotation)})">
        <rect class="structure-instance-hit" x="${localBounds.x - 14}" y="${localBounds.y - 14}" width="${localBounds.width + 28}" height="${localBounds.height + 28}"/>
        <g class="structure-instance-geometry">${shapes}${entities}</g>
        <rect class="structure-instance-outline" x="${localBounds.x}" y="${localBounds.y}" width="${localBounds.width}" height="${localBounds.height}"/>
        ${ports}
      </g>
      <g class="structure-instance-label" transform="translate(${labelX} ${labelY})">
        <rect x="0" y="-16" width="${labelWidth}" height="22"/>
        <text x="8" y="0">${escapeHtml(instance.name)} · Z ${formatNumber(instance.transform.z)}</text>
      </g>`;
  }

  function renderCanvas(context = selectedGraphContext()) {
    const { graph, level } = context;
    const moduleById = new Map(graph.modules.map((module) => [module.id, module]));
    const connectedEndpoints = new Set(graph.connections.flatMap((connection) => [
      connectionEndpointKey(connection.from),
      connectionEndpointKey(connection.to),
    ]));
    const connections = graph.connections.map((connection) => renderConnection(connection, graph)).join("");
    const instances = [...graph.instances]
      .sort((left, right) => finite(left.transform.z) - finite(right.transform.z))
      .map((instance) => {
        const module = moduleById.get(instance.moduleId);
        return module ? renderInstance(instance, module, level, graph, connectedEndpoints) : "";
      }).join("");
    const empty = graph.instances.length === 0
      ? '<g class="structure-canvas-empty"><text x="0" y="-8" text-anchor="middle">暂无模块实例</text><text x="0" y="14" text-anchor="middle">新增模块后在画布放置</text></g>'
      : "";
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2 + camera.panX;
    const centerY = rect.height / 2 + camera.panY;
    worldGroup.setAttribute("transform", `translate(${centerX} ${centerY}) scale(${camera.zoom})`);
    let pendingRoute = "";
    if (pendingConnection) {
      try {
        const from = portProjection(graph, pendingConnection, previewMode);
        const rawPoints = [...pendingRoutePoints, ...(pendingPointer ? [pendingPointer] : [])];
        const points = [from, ...rawPoints.map((point) => ({
          ...point,
          displayX: point.x,
          displayY: point.y - (previewMode === "exploded" ? from.z * EXPLODED_Z_FACTOR : 0),
        }))];
        if (points.length > 1) pendingRoute = `<path class="structure-route-pending" d="${connectionPath(points)}"/>`;
      } catch {
        pendingRoute = "";
      }
    }
    worldGroup.innerHTML = `${connections}${pendingRoute}${instances}${empty}`;
    zoomLabel.textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  function render() {
    const context = selectedGraphContext();
    summary.textContent = `${context.graph.modules.length} 个模块 · ${context.graph.instances.length} 个实例 · ${context.graph.connections.length} 条连接`;
    reuseButton.disabled = !context.selectedModule;
    newButton.classList.toggle("structure-command--active", interactionMode === "create");
    canvas.classList.toggle("is-placing-module", interactionMode === "create");
    previewButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.previewMode === previewMode)));
    renderSidebar(context);
    renderCanvas(context);
  }

  function displayedInstanceCorners(level, graph, instance) {
    const module = graph.modules.find((candidate) => candidate.id === instance.moduleId);
    if (!module) return [];
    const bounds = layerBounds(level, module.sourceLayerId);
    const local = [
      { x: bounds.x - module.origin.x, y: bounds.y - module.origin.y },
      { x: bounds.x + bounds.width - module.origin.x, y: bounds.y - module.origin.y },
      { x: bounds.x + bounds.width - module.origin.x, y: bounds.y + bounds.height - module.origin.y },
      { x: bounds.x - module.origin.x, y: bounds.y + bounds.height - module.origin.y },
    ];
    const projection = instanceProjection(instance, previewMode);
    return local.map((point) => {
      const rotated = rotatePoint(point, instance.transform.rotation);
      return { x: projection.x + rotated.x, y: projection.y + rotated.y };
    });
  }

  function fitAll() {
    const { level, graph } = selectedGraphContext();
    const points = graph.instances.flatMap((instance) => displayedInstanceCorners(level, graph, instance));
    if (points.length === 0) {
      camera.zoom = 0.6;
      camera.panX = 0;
      camera.panY = 0;
      renderCanvas({ level, graph });
      return;
    }
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(200, maxX - minX);
    const height = Math.max(160, maxY - minY);
    camera.zoom = Math.max(MIN_ZOOM, Math.min(1.25, (rect.width - 100) / width, (rect.height - 100) / height));
    camera.panX = -(minX + maxX) / 2 * camera.zoom;
    camera.panY = -(minY + maxY) / 2 * camera.zoom;
    hasFitted = true;
    renderCanvas({ level, graph });
  }

  function withOperation(operation) {
    try {
      operation();
    } catch (error) {
      showStatus(error.message, "error");
    }
  }

  function selectInstance(instanceId) {
    const graph = structureGraph(currentLevel());
    const instance = graph.instances.find((candidate) => candidate.id === instanceId);
    if (!instance) return;
    selectedInstanceId = instance.id;
    selectedModuleId = instance.moduleId;
    selectedPort = null;
    selectedConnectionId = null;
  }

  function createFromActiveLayer() {
    const state = getEditorState();
    const layer = state.level.layers.find((candidate) => candidate.id === state.activeLayerId);
    if (!layer) throw new Error("当前没有可用图层");
    const result = createModuleFromLayer(state.level, layer.id);
    selectedModuleId = result.moduleId;
    selectedInstanceId = result.instanceId;
    selectedPort = null;
    commitLevel(result.level);
    hasFitted = false;
    render();
    requestAnimationFrame(fitAll);
    showStatus(`已导入 ${layer.name ?? "楼层模块"}`, "success");
  }

  function armModulePlacement() {
    interactionMode = interactionMode === "create" ? null : "create";
    pendingConnection = null;
    pendingRoutePoints = [];
    pendingPointer = null;
    showStatus(interactionMode === "create" ? "放置新模块" : "已取消放置", interactionMode ? "active" : "idle");
    render();
  }

  function assemblyPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - rect.width / 2 - camera.panX) / camera.zoom,
      y: (event.clientY - rect.top - rect.height / 2 - camera.panY) / camera.zoom,
    };
  }

  function createModuleAt(event) {
    const point = assemblyPoint(event);
    const result = createEmptyStructureModule(currentLevel(), {
      transform: { x: point.x, y: point.y, z: 0, rotation: 0 },
    });
    selectedModuleId = result.moduleId;
    selectedInstanceId = result.instanceId;
    selectedPort = null;
    interactionMode = null;
    commitLevel(result.level);
    render();
    showStatus("模块已创建", "success");
  }

  function reuseSelectedModule() {
    const { level, selectedModule } = selectedGraphContext();
    if (!selectedModule) throw new Error("请先选择模块定义");
    const result = createModuleInstance(level, selectedModule.id);
    selectedInstanceId = result.instanceId;
    selectedPort = null;
    commitLevel(result.level);
    render();
    showStatus("已创建可复用实例", "success");
  }

  function handlePortClick(instanceId, portId) {
    const endpoint = { instanceId, portId };
    selectInstance(instanceId);
    selectedPort = endpoint;
    if (interactionMode !== "connect") {
      render();
      return;
    }
    if (!pendingConnection) {
      pendingConnection = endpoint;
      pendingRoutePoints = [];
      pendingPointer = null;
      showStatus("已选择第一个出入口", "active");
      render();
      return;
    }
    const result = connectModulePorts(currentLevel(), {
      type: selectedConnectionType,
      from: pendingConnection,
      to: endpoint,
      waypoints: pendingRoutePoints,
    });
    commitLevel(result.level);
    selectedConnectionId = result.connectionId;
    pendingConnection = null;
    pendingRoutePoints = [];
    pendingPointer = null;
    interactionMode = null;
    render();
    showStatus(`已建立${connectionType(selectedConnectionType).label}`, "success");
  }

  function editedModule() {
    if (!editSession) return null;
    return structureGraph(currentLevel()).modules.find((module) => module.id === editSession.moduleId) ?? null;
  }

  function renderEditBar() {
    const module = editedModule();
    if (!module || !editSession) return;
    editBar.innerHTML = `
      <button type="button" class="structure-command" data-exit-module-edit><span aria-hidden="true">←</span> 返回组装</button>
      <label class="structure-edit-field structure-edit-field--module"><span>模块内部</span><input type="text" value="${escapeHtml(module.name)}" data-edit-module-name></label>
      <span class="structure-edit-count">${module.ports.length} 个出入口</span>`;
  }

  let portDecorationFrame = 0;

  function schedulePortDirectionDecoration() {
    cancelAnimationFrame(portDecorationFrame);
    portDecorationFrame = requestAnimationFrame(() => {
      if (!editSession) return;
      const module = editedModule();
      if (!module) return;
      const shapes = currentLevel().shapes.filter((shape) => (
        shape.layerId === module.sourceLayerId && shape.modulePort
      ));
      decorateModulePortShapes(shapes);
    });
  }

  function publishModuleEditState(active, module = null) {
    if (active) document.body.dataset.moduleEditActive = "true";
    else delete document.body.dataset.moduleEditActive;
    window.dispatchEvent(new CustomEvent("layouttools:module-edit-state", {
      detail: {
        active,
        moduleId: module?.id ?? null,
        sourceLayerId: module?.sourceLayerId ?? null,
      },
    }));
  }

  function enterModuleEdit(instanceId = selectedInstanceId) {
    const state = getEditorState();
    const graph = structureGraph(state.level);
    const instance = graph.instances.find((candidate) => candidate.id === instanceId);
    const module = instance && graph.modules.find((candidate) => candidate.id === instance.moduleId);
    if (!instance || !module) throw new Error("请先选择要编辑的模块实例");
    const sourceLayer = state.level.layers.find((layer) => layer.id === module.sourceLayerId);
    if (!sourceLayer) throw new Error("模块源图层不存在");

    const editableLevel = syncModulePortsFromShapes(
      materializeModulePortShapes(state.level, module.id),
      module.id,
    );
    editSession = {
      moduleId: module.id,
      instanceId: instance.id,
      portSignature: JSON.stringify(structureGraph(editableLevel).modules
        .find((candidate) => candidate.id === module.id)?.ports ?? []),
      previousActiveLayerId: state.activeLayerId,
      layerState: new Map(state.level.layers.map((layer) => [layer.id, {
        visible: layer.visible,
        locked: layer.locked,
      }])),
    };
    selectedModuleId = module.id;
    selectedInstanceId = instance.id;
    const isolatedLevel = {
      ...editableLevel,
      layers: editableLevel.layers.map((layer) => ({
        ...layer,
        visible: layer.id === module.sourceLayerId,
        locked: layer.id === module.sourceLayerId ? false : layer.locked,
      })),
    };
    observedLevel = isolatedLevel;
    state.setLevel(isolatedLevel);
    state.setActiveLayerId(module.sourceLayerId);
    state.setSelectedIds([]);
    state.setActiveTool("select");
    panel.hidden = true;
    toggle.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    editBar.hidden = false;
    renderEditBar();
    publishModuleEditState(true, module);
    schedulePortDirectionDecoration();
    markPreviewStale();
  }

  function exitModuleEdit() {
    if (!editSession) return;
    const session = editSession;
    const state = getEditorState();
    const restoredLevel = {
      ...state.level,
      layers: state.level.layers.map((layer) => {
        const previous = session.layerState.get(layer.id);
        return previous ? { ...layer, ...previous } : layer;
      }),
    };
    observedLevel = restoredLevel;
    state.setLevel(restoredLevel);
    const activeLayerId = restoredLevel.layers.some((layer) => layer.id === session.previousActiveLayerId)
      ? session.previousActiveLayerId
      : restoredLevel.layers[0]?.id;
    if (activeLayerId) state.setActiveLayerId(activeLayerId);
    state.setSelectedIds([]);
    state.setActiveTool("select");
    editSession = null;
    editBar.hidden = true;
    toggle.hidden = false;
    publishModuleEditState(false);
    setPanelOpen(true);
    markPreviewStale();
    showStatus("模块内容与出入口已公布", "success");
  }

  function applyModuleName(target, recordHistory) {
    const module = editedModule();
    if (!module || !editSession) return false;
    if (!target.matches("[data-edit-module-name]")) return false;
    commitLevel(updateStructureModule(currentLevel(), module.id, { name: target.value }), recordHistory);
    return true;
  }

  toggle.addEventListener("click", () => setPanelOpen(panel.hidden));
  closeButton.addEventListener("click", () => setPanelOpen(false));
  newButton.addEventListener("click", armModulePlacement);
  importButton.addEventListener("click", () => withOperation(createFromActiveLayer));
  reuseButton.addEventListener("click", () => withOperation(reuseSelectedModule));
  fitButton.addEventListener("click", fitAll);
  previewRefreshButton.addEventListener("click", () => withOperation(refreshPreview));
  previewToggleButton.addEventListener("click", () => setPreviewOpen(!previewOpen));
  previewCloseButton.addEventListener("click", () => setPreviewOpen(false));
  window.addEventListener("layouttools:host-panel-open", (event) => {
    if (event.detail !== "structure") setPanelOpen(false);
  });

  previewButtons.forEach((button) => button.addEventListener("click", () => {
    previewMode = button.dataset.previewMode;
    render();
    requestAnimationFrame(fitAll);
  }));

  sidebar.addEventListener("click", (event) => withOperation(() => {
    const moduleButton = event.target.closest("[data-select-module]");
    if (moduleButton) {
      selectedModuleId = moduleButton.dataset.selectModule;
      selectedInstanceId = structureGraph(currentLevel()).instances
        .find((instance) => instance.moduleId === selectedModuleId)?.id ?? null;
      selectedPort = null;
      selectedConnectionId = null;
      render();
      return;
    }
    const instanceButton = event.target.closest("[data-select-instance]");
    if (instanceButton) {
      selectInstance(instanceButton.dataset.selectInstance);
      render();
      return;
    }
    const publishedPortButton = event.target.closest("[data-select-published-port]");
    if (publishedPortButton && selectedInstanceId) {
      selectedPort = {
        instanceId: selectedInstanceId,
        portId: publishedPortButton.dataset.selectPublishedPort,
      };
      render();
      return;
    }
    if (event.target.closest("[data-edit-module]")) {
      enterModuleEdit();
      return;
    }
    if (event.target.closest("[data-arm-connect]")) {
      interactionMode = interactionMode === "connect" ? null : "connect";
      pendingConnection = null;
      pendingRoutePoints = [];
      pendingPointer = null;
      showStatus(interactionMode === "connect" ? "选择第一个出入口" : "已取消连接", interactionMode ? "active" : "idle");
      render();
      return;
    }
    const connectionItem = event.target.closest("[data-select-connection]");
    if (connectionItem && !event.target.closest("[data-disconnect]")) {
      selectedConnectionId = connectionItem.dataset.selectConnection;
      selectedPort = null;
      render();
      return;
    }
    if (event.target.closest("[data-reuse-empty]")) {
      reuseSelectedModule();
      return;
    }
    const disconnectButton = event.target.closest("[data-disconnect]");
    if (disconnectButton) {
      commitLevel(disconnectModulePorts(currentLevel(), disconnectButton.dataset.disconnect));
      if (selectedConnectionId === disconnectButton.dataset.disconnect) selectedConnectionId = null;
      render();
      showStatus("连接已断开", "success");
      return;
    }
    if (event.target.closest("[data-delete-instance]")) {
      if (!selectedInstanceId || !window.confirm("删除这个模块实例及其连接？模块定义和源图层会保留。")) return;
      commitLevel(removeModuleInstance(currentLevel(), selectedInstanceId));
      selectedInstanceId = null;
      selectedPort = null;
      render();
      showStatus("实例已删除", "success");
      return;
    }
    if (event.target.closest("[data-delete-module]")) {
      const module = structureGraph(currentLevel()).modules.find((candidate) => candidate.id === selectedModuleId);
      const detail = module?.ownsSourceLayer ? "内部图层内容也会删除。" : "导入的源图层会保留。";
      if (!selectedModuleId || !window.confirm(`删除这个模块定义、全部复用实例及连接？${detail}`)) return;
      commitLevel(removeStructureModule(currentLevel(), selectedModuleId));
      selectedModuleId = null;
      selectedInstanceId = null;
      selectedPort = null;
      render();
      showStatus("模块定义已删除", "success");
      return;
    }
  }));

  sidebar.addEventListener("change", (event) => withOperation(() => {
    if (event.target.matches("[data-connection-type]")) {
      selectedConnectionType = event.target.value;
      return;
    }
    const { selectedInstance, selectedModule } = selectedGraphContext();
    if (event.target.matches("[data-module-name]") && selectedModule) {
      commitLevel(updateStructureModule(currentLevel(), selectedModule.id, { name: event.target.value }));
      render();
      return;
    }
    if (event.target.matches("[data-instance-name]") && selectedInstance) {
      commitLevel(updateStructureAssembly(currentLevel(), selectedInstance.id, { name: event.target.value }));
      render();
      return;
    }
    if (selectedInstance && event.target.matches("[data-instance-x], [data-instance-y], [data-instance-z], [data-instance-rotation]")) {
      const transform = { ...selectedInstance.transform };
      if (event.target.matches("[data-instance-x]")) transform.x = finite(event.target.value, transform.x);
      if (event.target.matches("[data-instance-y]")) transform.y = finite(event.target.value, transform.y);
      if (event.target.matches("[data-instance-z]")) transform.z = finite(event.target.value, transform.z);
      if (event.target.matches("[data-instance-rotation]")) transform.rotation = finite(event.target.value, transform.rotation);
      commitLevel(updateStructureAssembly(currentLevel(), selectedInstance.id, { transform }));
      render();
      return;
    }
  }));

  canvas.addEventListener("pointerdown", (event) => withOperation(() => {
    if (event.button !== 0) return;
    const waypointElement = event.target.closest("[data-connection-waypoint]");
    if (waypointElement && previewMode === "plan") {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail >= 2) {
        const graph = structureGraph(currentLevel());
        const connection = graph.connections.find((candidate) => candidate.id === waypointElement.dataset.connectionId);
        if (!connection) return;
        const waypoints = connection.waypoints.filter((_, index) => index !== Number(waypointElement.dataset.connectionWaypoint));
        commitLevel(updateConnectionWaypoints(currentLevel(), connection.id, waypoints));
        render();
        showStatus("折点已删除", "success");
        return;
      }
      selectedConnectionId = waypointElement.dataset.connectionId;
      drag = {
        kind: "waypoint",
        pointerId: event.pointerId,
        connectionId: selectedConnectionId,
        waypointIndex: Number(waypointElement.dataset.connectionWaypoint),
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging-route");
      worldGroup.querySelectorAll(".structure-connection").forEach((element) => {
        element.classList.toggle("is-selected", element.dataset.connectionId === selectedConnectionId);
      });
      return;
    }
    const connectionElement = event.target.closest("[data-connection-hit]");
    if (connectionElement) {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail >= 2 && previewMode === "plan") {
        const graph = structureGraph(currentLevel());
        const connection = graph.connections.find((candidate) => candidate.id === connectionElement.dataset.connectionHit);
        if (!connection) return;
        const from = worldPort(graph, connection.from);
        const to = worldPort(graph, connection.to);
        const point = assemblyPoint(event);
        const insertIndex = nearestSegmentIndex([from, ...connection.waypoints, to], point);
        const waypoints = [...connection.waypoints];
        waypoints.splice(insertIndex, 0, point);
        commitLevel(updateConnectionWaypoints(currentLevel(), connection.id, waypoints));
        selectedConnectionId = connection.id;
        render();
        showStatus("已添加路线折点", "success");
        return;
      }
      selectedConnectionId = connectionElement.dataset.connectionHit;
      selectedPort = null;
      worldGroup.querySelectorAll(".structure-connection").forEach((element) => {
        element.classList.toggle("is-selected", element.dataset.connectionId === selectedConnectionId);
      });
      return;
    }
    const portElement = event.target.closest("[data-port-id]");
    if (portElement) {
      event.preventDefault();
      event.stopPropagation();
      handlePortClick(portElement.dataset.portInstanceId, portElement.dataset.portId);
      return;
    }
    const instanceElement = event.target.closest("[data-instance-id]");
    if (interactionMode === "connect" && pendingConnection && !instanceElement) {
      const point = assemblyPoint(event);
      pendingRoutePoints.push(point);
      pendingPointer = point;
      showStatus(`已添加 ${pendingRoutePoints.length} 个折点`, "active");
      renderCanvas();
      return;
    }
    if (interactionMode === "create") {
      if (instanceElement) {
        showStatus("请在空白位置放置模块", "warning");
        return;
      }
      createModuleAt(event);
      return;
    }
    if (instanceElement) {
      const instanceId = instanceElement.dataset.instanceId;
      const pointerTime = performance.now();
      if (lastInstancePointer?.instanceId === instanceId && pointerTime - lastInstancePointer.time < 360) {
        lastInstancePointer = null;
        event.preventDefault();
        selectInstance(instanceId);
        enterModuleEdit(instanceId);
        return;
      }
      lastInstancePointer = { instanceId, time: pointerTime };
      selectInstance(instanceId);
      const instance = structureGraph(currentLevel()).instances.find((candidate) => candidate.id === instanceId);
      drag = {
        kind: "instance",
        pointerId: event.pointerId,
        instanceId,
        startX: event.clientX,
        startY: event.clientY,
        transform: { ...instance.transform },
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging-instance");
      render();
      return;
    }
    drag = {
      kind: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: camera.panX,
      panY: camera.panY,
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-panning");
  }));

  editBar.addEventListener("click", (event) => withOperation(() => {
    if (event.target.closest("[data-exit-module-edit]")) {
      exitModuleEdit();
      return;
    }
  }));

  editBar.addEventListener("change", (event) => withOperation(() => {
    applyModuleName(event.target, true);
  }));

  editBar.addEventListener("input", (event) => withOperation(() => {
    applyModuleName(event.target, false);
  }));

  canvas.addEventListener("pointermove", (event) => {
    if (!drag) {
      if (interactionMode === "connect" && pendingConnection) {
        pendingPointer = assemblyPoint(event);
        renderCanvas();
      }
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.kind === "pan") {
      camera.panX = drag.panX + deltaX;
      camera.panY = drag.panY + deltaY;
      renderCanvas();
      return;
    }
    if (drag.kind === "waypoint") {
      const graph = structureGraph(currentLevel());
      const connection = graph.connections.find((candidate) => candidate.id === drag.connectionId);
      if (!connection) return;
      const waypoints = [...connection.waypoints];
      waypoints[drag.waypointIndex] = assemblyPoint(event);
      commitLevel(updateConnectionWaypoints(currentLevel(), connection.id, waypoints), false);
      renderCanvas();
      return;
    }
    const transform = {
      ...drag.transform,
      x: drag.transform.x + deltaX / camera.zoom,
      y: drag.transform.y + deltaY / camera.zoom,
    };
    const level = updateStructureAssembly(currentLevel(), drag.instanceId, { transform });
    commitLevel(level, false);
    renderCanvas();
  });

  function endDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "instance" || drag.kind === "waypoint") {
      getEditorState().addToHistory(currentLevel());
      showStatus(drag.kind === "instance" ? "模块画布位置已更新" : "连接路线已更新", "success");
    }
    drag = null;
    canvas.classList.remove("is-panning", "is-dragging-instance", "is-dragging-route");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    render();
  }

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const centerX = rect.width / 2 + camera.panX;
    const centerY = rect.height / 2 + camera.panY;
    const worldX = (pointerX - centerX) / camera.zoom;
    const worldY = (pointerY - centerY) / camera.zoom;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * Math.exp(-event.deltaY * 0.0015)));
    camera.zoom = nextZoom;
    camera.panX = pointerX - rect.width / 2 - worldX * nextZoom;
    camera.panY = pointerY - rect.height / 2 - worldY * nextZoom;
    renderCanvas();
  }, { passive: false });

  window.addEventListener("resize", () => {
    if (!panel.hidden) {
      renderCanvas();
      if (previewOpen) previewRenderer?.resize();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (editSession && event.key === "Escape") {
      if (document.body.dataset.blockPlacementArmed === "true") return;
      exitModuleEdit();
      return;
    }
    if (panel.hidden || event.key !== "Escape") return;
    if (interactionMode || pendingConnection) {
      interactionMode = null;
      pendingConnection = null;
      pendingRoutePoints = [];
      pendingPointer = null;
      showStatus("操作已取消", "idle");
      render();
    } else {
      setPanelOpen(false);
    }
  });

  subscribeToEditor(() => {
    const state = getEditorState();
    const nextLevel = state.level;
    if (nextLevel === observedLevel) return;
    observedLevel = nextLevel;
    markPreviewStale();
    if (editSession) {
      const synchronized = syncModulePortsFromShapes(nextLevel, editSession.moduleId);
      const portSignature = JSON.stringify(structureGraph(synchronized).modules
        .find((module) => module.id === editSession.moduleId)?.ports ?? []);
      if (synchronized !== nextLevel || portSignature !== editSession.portSignature) {
        editSession.portSignature = portSignature;
        const aligned = updateStructureAssembly(synchronized, editSession.instanceId, {});
        observedLevel = aligned;
        state.setLevel(aligned);
      }
      renderEditBar();
      schedulePortDirectionDecoration();
      return;
    }
    if (!panel.hidden && !drag) render();
  });

  // The module assembly workspace is the primary entry point for this local tool.
  setPanelOpen(true);
}
