import { normalizeAiLayout } from "./block-catalog.js";
import { CONNECTION_TYPES, syncAllModulePortsFromShapes } from "./structure-module-model.js";

const CATALOG_MARKER = "LAYOUTTOOLS_BLOCK_CATALOG_V5";

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
    : {
      id: block.id,
      kind: block.kind,
      type: block.shapeType ?? block.entityType,
      ...(block.moduleOnly ? { moduleOnly: true, modulePort: { id: "port-id", name: "出入口", z: 0 } } : {}),
    });
}

export function createAiCatalogInstruction(catalog) {
  const connectionTypes = CONNECTION_TYPES.map((type) => ({
    id: type.id,
    label: type.label,
    directional: type.directional,
    offset: type.offset,
  }));
  return [
    CATALOG_MARKER,
    "生成或修改 LayoutTools JSON 时，可同时使用原生积木和 Blockout Tools 参数化积木。保留 shapes/entities/layers 格式。",
    "参数化积木必须写入 ueBlockout:{kind:'parametric',blockType,blueprintClassPath,parameters}。blockType、类路径、参数键和枚举值必须严格来自目录；未指定参数可省略并采用默认值。",
    "UE 参数化积木在网页中仍用目录指定的 rect/circle 二维形状表示，但尺寸必须与 parameters 一致。原生积木可使用 rect、circle、path 墙体、isStairs 楼梯和 entity，不要添加 ueBlockout。",
    "不要输出底层 StaticMesh assetId；它们是蓝图内部实现，不是可放置积木。",
    "需要楼层模块时，在关卡根级保留或生成 structureGraph:{schemaVersion:2,modules,instances,connections}。module={id,name,sourceLayerId,ownsSourceLayer,origin:{x,y,z},ports:[{id,name,position:{x,y,z},facing}]}，port.position 是相对 module.origin 的局部厘米坐标，facing 是网页平面角度。instance={id,moduleId,name,transform:{x,y,z,rotation}}。connection={id,type,from:{instanceId,portId},to:{instanceId,portId},waypoints:[{x,y}]}；waypoints 仅用于无限画布上的折线路由排版。",
    "无限画布中的模块定义必须引用一个内部编辑图层；新建模块使用 ownsSourceLayer:true，内部楼板、墙体、原生积木和参数化积木都写入 sourceLayerId 对应的 shapes/entities。已有图层导入模块使用 ownsSourceLayer:false。外部组装只新增或移动 instances、connections，不复制源图层内容。",
    "出入口是 sourceLayerId 图层中的普通 rect 形状积木：shape.modulePort={id,name,z}，局部 XY 取形状中心相对 module.origin 的坐标，facing 取 shape.rotation；width/height 只是内部画布占位，不导入 UE。module.ports 必须与这些形状同步。",
    "出入口本身不分进出；单向方向由 connection.from 指向 connection.to，普通楼梯在关系图中使用双向箭头。一个实例上的一个出入口最多连接一次；通过模块预设的多个出入口形成路线分支。无限画布的 instance.transform 是关系图排版位置，刷新三维预览或导出时才按连接类型、出入口局部位置和 facing 求解最终拼接。只使用用户明确给出的出入口及数量；修改现有关卡时必须保留已有出入口，不得为方便连接而自行新增。",
    `模块连接形式=${JSON.stringify(connectionTypes)}`,
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
          return originalSetLevel((current) => syncAllModulePortsFromShapes(normalizeAiLayout(value(current), catalog).level));
        }
        const normalized = normalizeAiLayout(value, catalog);
        if (normalized.warnings.length > 0) {
          window.dispatchEvent(new CustomEvent("layouttools:ai-normalization-warning", {
            detail: { warnings: normalized.warnings },
          }));
        }
        return originalSetLevel(syncAllModulePortsFromShapes(normalized.level));
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
