function normalizeMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function renderBootError(rootId, error) {
  const root = document.getElementById(rootId);

  if (!root) {
    return;
  }

  const panel = document.createElement("main");
  panel.className = "boot-error";

  const title = document.createElement("h1");
  title.textContent = "LayoutTools 启动失败";

  const message = document.createElement("p");
  message.textContent = normalizeMessage(error);

  const hint = document.createElement("p");
  hint.textContent = "请确认通过 npm start 启动本地服务，并检查终端中的错误信息。";

  panel.append(title, message, hint);
  root.replaceChildren(panel);
}

