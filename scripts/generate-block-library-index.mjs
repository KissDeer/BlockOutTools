import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const library = new URL("../app-v2/src/domain/block-library/", import.meta.url);
const entries = (await readdir(library, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
const rows = [];
for (const entry of entries) {
  const directory = new URL(entry.name + "/", library);
  const definition = JSON.parse(await readFile(new URL("definition.json", directory), "utf8"));
  if (definition.type !== entry.name || definition.definitionVersion !== 1) throw new Error("积木身份或定义版本无效：" + entry.name);
  for (const path of [definition.usageFile, ...definition.examples]) {
    if (typeof path !== "string" || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.split("/").includes("..") || path.startsWith("/")) throw new Error("引用必须为积木目录内的相对路径");
    await access(new URL(path, directory));
  }
  const cell = (value) => String(value).replaceAll("|", " / ").replace(/[\r\n]/g, " ");
  rows.push("| [" + cell(definition.label) + "](" + entry.name + "/" + definition.usageFile + ") | " + definition.type + " | " + definition.definitionVersion + " | " + cell(definition.review.usage) + " | " + cell(definition.review.preview) + " | " + cell(definition.review.ue) + " |");
}
const content = "# 积木规则库\n\n<!-- 由 scripts/generate-block-library-index.mjs 生成，请修改对应 definition.json。 -->\n\n先读 [通用规则](common-rules.md)，再按类型读取 definition.json、usage.md 和需要的 examples。目录中的定义只有经 catalog.ts 注册并实现后才可在网页使用。\n\n| 积木与用法 | 固定类型 ID | 规则版本 | 用法确认 | 网页预览 | UE 验证 |\n|---|---|---|---|---|---|\n" + rows.join("\n") + "\n";
const target = new URL("README.md", library);
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")).replaceAll("\r\n", "\n") !== content) throw new Error("积木索引已过期，请重新生成");
  console.log("积木索引与引用检查通过");
} else {
  await writeFile(target, content, "utf8");
  console.log(fileURLToPath(target));
}
