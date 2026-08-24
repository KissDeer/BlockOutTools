import { normalizeAiLayout } from "./block-catalog.js";

const CATALOG_MARKER = "LAYOUTTOOLS_BLOCK_CATALOG_V2";

function compactCatalog(catalog) {
  return catalog.map((block) => block.source === "ue"
    ? {
      blockType: block.blockType,
      form: block.form,
      planShape: block.shapeType,
      blueprintClassPath: block.blueprintClassPath,
      parameters: [...block.parameters, ...block.commonParameters].map((parameter) => ({
        key: parameter.key,
        type: parameter.type,
        default: parameter.default,
        min: parameter.min,
        max: parameter.max,
        options: parameter.options?.map((option) => option.value),
      })),
    }
    : { id: block.id, kind: block.kind, type: block.shapeType ?? block.entityType });
}

export function createAiCatalogInstruction(catalog) {
  return [
    CATALOG_MARKER,
    "生成或修改 LayoutTools JSON 时，可同时使用原生积木和 Blockout Tools 参数化积木。保留 shapes/entities/layers 格式。",
    "参数化积木必须写入 ueBlockout:{kind:'parametric',blockType,blueprintClassPath,parameters}。blockType、类路径、参数键和枚举值必须严格来自目录；未指定参数可省略并采用默认值。",
    "UE 参数化积木在网页中仍用目录指定的 rect/circle 二维形状表示，但尺寸必须与 parameters 一致。原生积木可使用 rect、circle、path 墙体、isStairs 楼梯和 entity，不要添加 ueBlockout。",
    "不要输出底层 StaticMesh assetId；它们是蓝图内部实现，不是可放置积木。",
    `目录=${JSON.stringify(compactCatalog(catalog))}`,
  ].join("\n");
}

function appendText(value, instruction) {
  if (typeof value === "string") {
    return value.includes(CATALOG_MARKER) ? value : `${value}\n\n${instruction}`;
  }
  return value;
}

export function augmentAiRequestBody(body, instruction) {
  if (!body || typeof body !== "object") return body;
  const next = structuredClone(body);

  if (Array.isArray(next.messages)) {
    const system = next.messages.find((message) => message.role === "system");
    if (system && typeof system.content === "string") {
      system.content = appendText(system.content, instruction);
    } else if (system && Array.isArray(system.content)) {
      if (!JSON.stringify(system.content).includes(CATALOG_MARKER)) {
        system.content.push({ type: "text", text: instruction });
      }
    } else {
      next.messages.unshift({ role: "system", content: instruction });
    }
    return next;
  }

  if (typeof next.instructions === "string") {
    next.instructions = appendText(next.instructions, instruction);
    return next;
  }

  if (next.system != null) {
    if (typeof next.system === "string") {
      next.system = appendText(next.system, instruction);
    } else if (Array.isArray(next.system) && !JSON.stringify(next.system).includes(CATALOG_MARKER)) {
      next.system.push({ type: "text", text: instruction });
    }
    return next;
  }

  if (next.systemInstruction != null) {
    if (typeof next.systemInstruction === "string") {
      next.systemInstruction = appendText(next.systemInstruction, instruction);
    } else {
      next.systemInstruction.parts ??= [];
      if (!JSON.stringify(next.systemInstruction).includes(CATALOG_MARKER)) {
        next.systemInstruction.parts.push({ text: instruction });
      }
    }
    return next;
  }

  if (Array.isArray(next.contents)) {
    next.systemInstruction = { parts: [{ text: instruction }] };
    return next;
  }

  if (Array.isArray(next.input) || typeof next.input === "string") {
    next.instructions = instruction;
  }
  return next;
}

function looksLikeAiRequest(url, method, body) {
  if (method !== "POST" || !body) return false;
  return /(?:chat\/completions|\/responses|\/messages|:generateContent)(?:$|[?#])/i.test(url);
}

export function installAiBlockBridge(catalog) {
  if (window.__LAYOUT_TOOLS_AI_BRIDGE__) return;
  const instruction = createAiCatalogInstruction(catalog);
  const originalFetch = window.fetch.bind(window);

  window.__LAYOUT_TOOLS_AI_CATALOG__ = Object.freeze(catalog.map((block) => ({ ...block })));
  window.__LAYOUT_TOOLS_AI_BRIDGE__ = { marker: CATALOG_MARKER, instruction };
  const store = window.__LAYOUT_TOOLS_STORE__;
  if (store?.getState && store?.setState) {
    const originalSetLevel = store.getState().setLevel;
    store.setState({
      setLevel(value) {
        if (typeof value === "function") {
          return originalSetLevel((current) => normalizeAiLayout(value(current), catalog).level);
        }
        const normalized = normalizeAiLayout(value, catalog);
        if (normalized.warnings.length > 0) {
          window.dispatchEvent(new CustomEvent("layouttools:ai-normalization-warning", {
            detail: { warnings: normalized.warnings },
          }));
        }
        return originalSetLevel(normalized.level);
      },
    });
  }
  window.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const method = String(init.method ?? request?.method ?? "GET").toUpperCase();
    const url = String(request?.url ?? input);
    let rawBody = init.body;
    if (rawBody == null && request && method === "POST") {
      rawBody = await request.clone().text();
    }

    if (!looksLikeAiRequest(url, method, rawBody) || typeof rawBody !== "string") {
      return originalFetch(input, init);
    }

    try {
      const body = augmentAiRequestBody(JSON.parse(rawBody), instruction);
      const bodyText = JSON.stringify(body);
      if (request) {
        return originalFetch(new Request(request, { ...init, body: bodyText }));
      }
      return originalFetch(input, { ...init, body: bodyText });
    } catch {
      return originalFetch(input, init);
    }
  };
}

export { CATALOG_MARKER };
