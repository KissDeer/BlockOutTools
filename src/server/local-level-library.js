import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const STATE_FILE = ".library-state.json";
const INVALID_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]/;

export class LocalLevelLibraryError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "LocalLevelLibraryError";
    this.statusCode = statusCode;
  }
}

function assertLevel(level) {
  if (!level || typeof level !== "object") {
    throw new LocalLevelLibraryError("关卡数据必须是 JSON 对象");
  }
  for (const field of ["shapes", "entities", "layers"]) {
    if (!Array.isArray(level[field])) {
      throw new LocalLevelLibraryError(`关卡数据缺少 ${field} 数组`);
    }
  }
}

export function normalizeLevelFileName(value) {
  let fileName = String(value ?? "").trim();
  if (!fileName) {
    throw new LocalLevelLibraryError("文件名不能为空");
  }
  if (INVALID_FILE_NAME.test(fileName) || basename(fileName) !== fileName || fileName.includes("..")) {
    throw new LocalLevelLibraryError("文件名包含不允许的字符");
  }
  if (extname(fileName).toLocaleLowerCase() !== ".json") {
    fileName += ".json";
  }
  if (fileName.length > 120) {
    throw new LocalLevelLibraryError("文件名不能超过 120 个字符");
  }
  return fileName;
}

async function readState(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    return typeof state.lastOpened === "string" ? state : {};
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return {};
    throw error;
  }
}

function summarize(fileName, level, fileStat) {
  return {
    name: fileName,
    levelName: String(level.name || "Untitled Level"),
    shapes: level.shapes.length,
    entities: level.entities.length,
    layers: level.layers.length,
    modifiedAt: fileStat.mtime.toISOString(),
    bytes: fileStat.size,
  };
}

export class LocalLevelLibrary {
  constructor(options) {
    this.directory = resolve(options.directory);
    this.autosaveFile = normalizeLevelFileName(options.autosaveFile ?? "autosave.json");
    this.autosaveDelayMs = Number.isFinite(options.autosaveDelayMs)
      ? Math.max(0, options.autosaveDelayMs)
      : 800;
    this.restoreLastOpened = options.restoreLastOpened !== false;
    this.statePath = resolve(this.directory, STATE_FILE);
    this.writeQueue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true });
  }

  filePath(fileName) {
    return resolve(this.directory, normalizeLevelFileName(fileName));
  }

  async writeState(lastOpened) {
    await writeFile(this.statePath, `${JSON.stringify({ lastOpened }, null, 2)}\n`, "utf8");
  }

  async save(fileName, level) {
    assertLevel(level);
    const normalizedName = normalizeLevelFileName(fileName);
    const operation = this.writeQueue.then(async () => {
      await this.initialize();
      const target = this.filePath(normalizedName);
      await writeFile(target, `${JSON.stringify(level, null, 2)}\n`, "utf8");
      await this.writeState(normalizedName);
      return summarize(normalizedName, level, await stat(target));
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async load(fileName) {
    const normalizedName = normalizeLevelFileName(fileName);
    let text;
    try {
      text = await readFile(this.filePath(normalizedName), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new LocalLevelLibraryError(`未找到本地关卡：${normalizedName}`, 404);
      }
      throw error;
    }
    let level;
    try {
      level = JSON.parse(text);
    } catch {
      throw new LocalLevelLibraryError(`本地关卡不是有效 JSON：${normalizedName}`);
    }
    assertLevel(level);
    await this.writeState(normalizedName);
    return { file: summarize(normalizedName, level, await stat(this.filePath(normalizedName))), level };
  }

  async list() {
    await this.initialize();
    const entries = await readdir(this.directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || extname(entry.name).toLocaleLowerCase() !== ".json" || entry.name === STATE_FILE) {
        continue;
      }
      try {
        const path = this.filePath(entry.name);
        const [text, fileStat] = await Promise.all([readFile(path, "utf8"), stat(path)]);
        const level = JSON.parse(text);
        assertLevel(level);
        files.push(summarize(entry.name, level, fileStat));
      } catch (error) {
        files.push({ name: entry.name, invalid: true, error: error.message });
      }
    }
    files.sort((left, right) => String(right.modifiedAt ?? "").localeCompare(String(left.modifiedAt ?? "")));
    const state = await readState(this.statePath);
    const names = new Set(files.filter((file) => !file.invalid).map((file) => file.name));
    const restoreFile = this.restoreLastOpened && names.has(state.lastOpened)
      ? state.lastOpened
      : names.has(this.autosaveFile) ? this.autosaveFile : null;
    return {
      directory: this.directory,
      autosaveFile: this.autosaveFile,
      autosaveDelayMs: this.autosaveDelayMs,
      lastOpened: names.has(state.lastOpened) ? state.lastOpened : null,
      restoreFile,
      files,
    };
  }
}
