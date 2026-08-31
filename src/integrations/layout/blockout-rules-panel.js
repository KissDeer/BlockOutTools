import {
  blockoutProfile,
  DEFAULT_BLOCKOUT_PROFILE,
  normalizeBlockoutProfile,
  validateBlockoutLevel,
} from "./blockout-rules.js";
import {
  getEditorState,
  replaceEditorLevel,
  subscribeToEditor,
} from "./editor-store-adapter.js";

const FIELDS = Object.freeze([
  ["capsuleRadius", "胶囊半径"],
  ["capsuleHalfHeight", "胶囊半高"],
  ["eyeHeight", "视点高度"],
  ["maxStepHeight", "最大跨步"],
  ["jumpHeight", "跳跃高度"],
  ["minDoorWidth", "最小门宽"],
  ["minDoorHeight", "最小门高"],
  ["minCorridorWidth", "最小通行宽"],
  ["minHeadroom", "最小净空"],
  ["maxStairRiser", "最大踢面"],
  ["minStairTread", "最小踏步"],
  ["minLandingDepth", "最小落脚区"],
  ["maxRampSlope", "最大坡度"],
]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function mountBlockoutRulesPanel() {
  if (document.querySelector("[data-blockout-rules-panel]")) return;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "workflow-panel-toggle workflow-panel-toggle--rules";
  toggle.textContent = "规范";
  toggle.setAttribute("aria-label", "打开白盒规范面板");

  const panel = document.createElement("section");
  panel.className = "workflow-panel blockout-rules-panel";
  panel.dataset.blockoutRulesPanel = "";
  panel.hidden = true;
  panel.innerHTML = `
    <header class="workflow-panel__header">
      <div><strong>白盒规范</strong><span>保存于当前关卡 · cm / deg</span></div>
      <button type="button" class="workflow-icon-button" data-rules-close aria-label="关闭">×</button>
    </header>
    <div class="workflow-panel__body">
      <label class="workflow-field workflow-field--wide"><span>规范名称</span><input type="text" data-rule-name></label>
      <div class="workflow-rule-switches">
        <label><input type="checkbox" data-rule-flag="enabled"><span>启用规范检查</span></label>
        <label><input type="checkbox" data-rule-flag="enforceUeImport"><span>阻止不合格 UE 导入</span></label>
      </div>
      <div class="workflow-field-grid" data-rule-fields></div>
      <div class="workflow-actions">
        <button type="button" data-rules-default>恢复默认</button>
        <button type="button" class="workflow-primary" data-rules-check>重新检查</button>
      </div>
      <div class="workflow-validation-summary" data-rules-summary></div>
      <div class="workflow-validation-list" data-rules-findings></div>
    </div>`;
  document.body.append(toggle, panel);

  const nameInput = panel.querySelector("[data-rule-name]");
  const fields = panel.querySelector("[data-rule-fields]");
  const summary = panel.querySelector("[data-rules-summary]");
  const findings = panel.querySelector("[data-rules-findings]");
  fields.innerHTML = FIELDS.map(([key, label]) => `
    <label class="workflow-field"><span>${label}</span><input type="number" min="1" step="1" data-rule-key="${key}"></label>
  `).join("");

  let renderedFingerprint = "";
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) window.dispatchEvent(new CustomEvent("layouttools:host-panel-open", { detail: "rules" }));
  }

  function selectFinding(itemId, layerId) {
    const state = getEditorState();
    if (layerId && state.level.layers.some((layer) => layer.id === layerId)) state.setActiveLayerId(layerId);
    state.setActiveTool("select");
    state.setSelectedIds([itemId]);
  }

  function render(force = false) {
    const level = getEditorState().level;
    const validation = validateBlockoutLevel(level);
    const fingerprint = JSON.stringify({ profile: validation.profile, findings: validation.findings });
    if (!force && fingerprint === renderedFingerprint) return;
    renderedFingerprint = fingerprint;
    if (document.activeElement !== nameInput) nameInput.value = validation.profile.name;
    for (const input of fields.querySelectorAll("[data-rule-key]")) {
      if (document.activeElement !== input) input.value = validation.profile[input.dataset.ruleKey];
    }
    for (const input of panel.querySelectorAll("[data-rule-flag]")) input.checked = validation.profile[input.dataset.ruleFlag];
    summary.innerHTML = `<strong>${validation.errorCount} 个错误</strong><span>${validation.warningCount} 个警告 · ${level.shapes.length} 个形状</span>`;
    summary.dataset.state = validation.errorCount ? "error" : validation.warningCount ? "warning" : "success";
    findings.innerHTML = validation.findings.length ? validation.findings.map((item) => `
      <button type="button" data-finding-id="${escapeHtml(item.itemId)}" data-finding-layer="${escapeHtml(item.layerId ?? "")}" data-severity="${item.severity}">
        <strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.message)}</span>
      </button>
    `).join("") : '<div class="workflow-empty">当前可识别积木符合规范</div>';
  }

  function commitProfile(profile) {
    const level = getEditorState().level;
    replaceEditorLevel({ ...level, blockoutProfile: normalizeBlockoutProfile(profile) }, { recordHistory: true });
    render(true);
  }

  function readForm() {
    const profile = { name: nameInput.value };
    for (const input of panel.querySelectorAll("[data-rule-flag]")) profile[input.dataset.ruleFlag] = input.checked;
    for (const input of fields.querySelectorAll("[data-rule-key]")) profile[input.dataset.ruleKey] = Number(input.value);
    return profile;
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector("[data-rules-close]").addEventListener("click", () => setOpen(false));
  panel.querySelector("[data-rules-default]").addEventListener("click", () => commitProfile(DEFAULT_BLOCKOUT_PROFILE));
  panel.querySelector("[data-rules-check]").addEventListener("click", () => render(true));
  panel.addEventListener("change", (event) => {
    if (event.target.matches("[data-rule-name], [data-rule-key], [data-rule-flag]")) commitProfile(readForm());
  });
  findings.addEventListener("click", (event) => {
    const button = event.target.closest("[data-finding-id]");
    if (button) selectFinding(button.dataset.findingId, button.dataset.findingLayer);
  });
  window.addEventListener("layouttools:host-panel-open", (event) => {
    if (event.detail !== "rules") setOpen(false);
  });
  subscribeToEditor(() => render());
  render(true);
}
