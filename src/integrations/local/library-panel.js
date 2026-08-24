import {
  getEditorLevelSnapshot,
  getEditorState,
  replaceEditorLevel,
  subscribeToEditor,
} from "../layout/editor-store-adapter.js";

const API_ROOT = "/api/local-levels";
const INVALID_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]+/g;

async function requestJson(path = "", options) {
  const response = await fetch(`${API_ROOT}${path}`, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function fileName(value) {
  const stem = String(value || "Untitled Level")
    .trim()
    .replace(INVALID_FILE_NAME, "_")
    .replace(/\.json$/i, "")
    .slice(0, 115);
  return `${stem || "Untitled Level"}.json`;
}

function formatModifiedAt(value) {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export async function mountLocalLevelLibrary() {
  if (document.querySelector("[data-local-library]")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "local-library-toggle";
  toggle.dataset.localLibrary = "toggle";
  toggle.setAttribute("aria-label", "打开本地关卡库");
  toggle.title = "本地关卡库";
  toggle.textContent = "本地";

  const panel = document.createElement("section");
  panel.className = "local-library-panel";
  panel.dataset.localLibrary = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "本地关卡库");
  panel.innerHTML = `
    <header class="local-library-header">
      <div>
        <strong>本地关卡库</strong>
        <span data-local-directory>读取保存位置...</span>
      </div>
      <button type="button" class="local-library-icon-button" data-local-close aria-label="关闭本地关卡库" title="关闭">×</button>
    </header>
    <div class="local-library-current">
      <span>当前文件</span>
      <strong data-local-current>准备中...</strong>
      <small>编辑后自动保存</small>
    </div>
    <div class="local-library-section">
      <label class="local-library-field">
        <span>保存文件名</span>
        <input type="text" data-local-file-name aria-label="本地关卡文件名" spellcheck="false">
      </label>
      <div class="local-library-actions">
        <button type="button" class="local-library-button local-library-button--primary" data-local-save>保存当前</button>
        <button type="button" class="local-library-icon-button local-library-refresh" data-local-refresh aria-label="刷新本地文件列表" title="刷新">↻</button>
      </div>
    </div>
    <div class="local-library-section">
      <div class="local-library-section-title">选择要打开的文件</div>
      <select class="local-library-files" size="6" data-local-files aria-label="已保存的本地关卡"></select>
      <div class="local-library-file-meta" data-local-file-meta>暂无本地文件</div>
      <button type="button" class="local-library-button" data-local-open disabled>打开选中</button>
    </div>
    <output class="local-library-status" data-local-status data-state="loading" aria-live="polite">正在读取本地关卡...</output>
  `;
  document.body.append(toggle, panel);

  const closeButton = panel.querySelector("[data-local-close]");
  const directoryLabel = panel.querySelector("[data-local-directory]");
  const currentLabel = panel.querySelector("[data-local-current]");
  const fileNameInput = panel.querySelector("[data-local-file-name]");
  const saveButton = panel.querySelector("[data-local-save]");
  const refreshButton = panel.querySelector("[data-local-refresh]");
  const filesSelect = panel.querySelector("[data-local-files]");
  const fileMeta = panel.querySelector("[data-local-file-meta]");
  const openButton = panel.querySelector("[data-local-open]");
  const status = panel.querySelector("[data-local-status]");
  const actionButtons = [saveButton, refreshButton, openButton];
  let activeFile = null;
  let autosaveFile = "autosave.json";
  let autosaveDelayMs = 800;
  let levelReference = getEditorState().level;
  let pauseAutosave = false;
  let autosaveTimer = null;
  let saveQueue = Promise.resolve();
  let libraryFiles = [];
  let isBusy = false;

  function setPanelOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      window.dispatchEvent(new CustomEvent("layouttools:host-panel-open", { detail: "local" }));
    }
  }

  function setStatus(message, state = "idle") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function setBusy(busy) {
    isBusy = busy;
    saveButton.disabled = isBusy;
    refreshButton.disabled = isBusy;
    const selected = libraryFiles.find((file) => file.name === filesSelect.value);
    openButton.disabled = isBusy || !selected || selected.invalid === true;
  }

  function updateCurrentFile(nextFile) {
    activeFile = nextFile;
    currentLabel.textContent = nextFile;
    currentLabel.title = nextFile;
    fileNameInput.value = nextFile;
  }

  function updateSelectionDetails() {
    const selected = libraryFiles.find((file) => file.name === filesSelect.value);
    openButton.disabled = isBusy || !selected || selected.invalid === true;
    if (!selected) {
      fileMeta.textContent = libraryFiles.length ? "请选择一个文件" : "暂无本地文件";
      return;
    }
    fileMeta.textContent = selected.invalid
      ? `无法读取 · ${selected.error}`
      : `${selected.levelName} · ${selected.shapes} 形状 · ${selected.layers} 图层 · ${formatModifiedAt(selected.modifiedAt)}`;
  }

  function renderFiles(files, preferredFile = activeFile) {
    libraryFiles = files;
    filesSelect.replaceChildren();
    for (const file of files) {
      const option = document.createElement("option");
      option.value = file.name;
      option.disabled = file.invalid === true;
      option.textContent = file.invalid
        ? `${file.name} · 无法读取`
        : `${file.name} · ${file.shapes} 形状 · ${formatModifiedAt(file.modifiedAt)}`;
      filesSelect.append(option);
    }
    if (files.some((file) => file.name === preferredFile && !file.invalid)) {
      filesSelect.value = preferredFile;
    } else if (files[0] && !files[0].invalid) {
      filesSelect.value = files[0].name;
    }
    updateSelectionDetails();
  }

  async function refreshLibrary() {
    const payload = await requestJson();
    directoryLabel.textContent = payload.directory;
    directoryLabel.title = payload.directory;
    autosaveFile = payload.autosaveFile;
    renderFiles(payload.files);
    return payload;
  }

  function persistSnapshot(targetFile, snapshot, options = {}) {
    const operation = saveQueue.then(() => requestJson("/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: targetFile, level: snapshot }),
    }));
    saveQueue = operation.catch(() => {});
    return operation.then((payload) => {
      if (!options.quiet) setStatus(`已保存 ${payload.file.name}`, "success");
      return payload;
    });
  }

  async function saveCurrent(options = {}) {
    const targetFile = fileName(options.fileName ?? activeFile ?? autosaveFile);
    const snapshot = getEditorLevelSnapshot();
    if (!options.quiet) setBusy(true);
    try {
      const payload = await persistSnapshot(targetFile, snapshot, options);
      updateCurrentFile(payload.file.name);
      if (!options.quiet) {
        const library = await refreshLibrary();
        renderFiles(library.files, payload.file.name);
      }
      return payload;
    } catch (error) {
      setStatus(`保存失败：${error.message}`, "error");
      throw error;
    } finally {
      if (!options.quiet) setBusy(false);
    }
  }

  async function openFile(selectedFile, options = {}) {
    clearTimeout(autosaveTimer);
    if (activeFile && !options.restoring) {
      await saveCurrent({ quiet: true });
    }
    setBusy(true);
    setStatus(options.restoring ? `正在恢复 ${selectedFile}...` : `正在打开 ${selectedFile}...`, "loading");
    try {
      const payload = await requestJson(`/open?file=${encodeURIComponent(selectedFile)}`);
      pauseAutosave = true;
      replaceEditorLevel(payload.level);
      levelReference = getEditorState().level;
      updateCurrentFile(payload.file.name);
      filesSelect.value = payload.file.name;
      updateSelectionDetails();
      setStatus(options.restoring ? `已恢复 ${payload.file.name}` : `已打开 ${payload.file.name}`, "success");
    } catch (error) {
      setStatus(`打开失败：${error.message}`, "error");
      throw error;
    } finally {
      pauseAutosave = false;
      setBusy(false);
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    setStatus(`等待自动保存到 ${activeFile ?? autosaveFile}`, "pending");
    autosaveTimer = window.setTimeout(() => {
      void saveCurrent({ quiet: true }).then((payload) => {
        setStatus(`已自动保存 ${payload.file.name}`, "success");
      }).catch(() => {});
    }, autosaveDelayMs);
  }

  toggle.addEventListener("click", () => setPanelOpen(panel.hidden));
  closeButton.addEventListener("click", () => setPanelOpen(false));
  window.addEventListener("layouttools:host-panel-open", (event) => {
    if (event.detail !== "local") setPanelOpen(false);
  });
  filesSelect.addEventListener("change", updateSelectionDetails);
  refreshButton.addEventListener("click", () => {
    setBusy(true);
    void refreshLibrary()
      .then(() => setStatus("文件列表已刷新", "success"))
      .catch((error) => setStatus(`刷新失败：${error.message}`, "error"))
      .finally(() => setBusy(false));
  });
  saveButton.addEventListener("click", () => {
    void saveCurrent({ fileName: fileNameInput.value }).catch(() => {});
  });
  openButton.addEventListener("click", () => {
    if (filesSelect.value) void openFile(filesSelect.value).catch(() => {});
  });

  try {
    const library = await refreshLibrary();
    autosaveDelayMs = Number.isFinite(library.autosaveDelayMs)
      ? library.autosaveDelayMs
      : autosaveDelayMs;
    if (library.restoreFile) {
      await openFile(library.restoreFile, { restoring: true });
    } else {
      updateCurrentFile(autosaveFile);
      await saveCurrent({ quiet: true });
      const refreshed = await refreshLibrary();
      renderFiles(refreshed.files, activeFile);
      setStatus(`已建立默认保存文件 ${activeFile}`, "success");
    }
  } catch (error) {
    updateCurrentFile(autosaveFile);
    setStatus(`本地关卡库不可用：${error.message}`, "error");
  }

  subscribeToEditor(() => {
    const nextLevel = getEditorState().level;
    if (pauseAutosave || nextLevel === levelReference) return;
    levelReference = nextLevel;
    scheduleAutosave();
  });

  window.addEventListener("pagehide", () => {
    if (!activeFile) return;
    const payload = JSON.stringify({ fileName: activeFile, level: getEditorLevelSnapshot() });
    navigator.sendBeacon(`${API_ROOT}/save`, new Blob([payload], { type: "application/json" }));
  });
}
