// 把一个 BlockOutTools V2 项目 JSON 导出为 UE Actor 计划，交给 scripts/ue_unreal_spawn.py 批量布景。
//
// 用法:
//   node scripts/export-ue-actors.mjs <path-to-project.json> [--out <dir>]
//   --out 缺省时输出到 <项目同目录>/ue-plan/<项目文件名>.actors.json（与既有约定一致）
//
// 这个脚本**只是一层 CLI**：几何展平（flattenProjectGeometry）与 Actor 计划（buildLocalUEDryRun）
// 都来自 app 自己的领域代码（app-v2/src/domain/ue-plan.ts、node-geometry.ts）。
// 从前它手抄了一整套连接求解器和 CONNECTION_RULES，与 app 内的实现靠注释约定一致、没有测试锁住，
// 模块层删除后那套求解器连数据来源都没有了。现在只有一份实现，不会再漂移。
//
// 跑 TypeScript 的办法沿用已删的 generate-diagram-project.mjs：用 app-v2/tsconfig.domain-cjs.json
// 把 src/domain 编成 CommonJS，再 require 编译产物。编译目标是个**临时目录**（每次运行重编、
// 运行结束删掉），不是仓库里的 .domain-verify/ ——那个目录已经删了，别再往仓库里写构建产物。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appDir = resolve(repoRoot, "app-v2");

let fileArg = null;
let outDir = null;
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--out") {
    outDir = argv[index + 1];
    if (!outDir) {
      console.error("--out 后面要跟一个目录");
      process.exit(2);
    }
    index += 1;
  } else if (fileArg === null) {
    fileArg = argv[index];
  }
}
if (!fileArg) {
  console.error("用法: node scripts/export-ue-actors.mjs <path-to-project.json> [--out <dir>]");
  process.exit(2);
}
const projectPath = resolve(fileArg);

/**
 * 把 app-v2/src/domain 编成 CommonJS，返回要用的两个入口。
 *
 * 编译到系统临时目录：仓库内以前的落点是 `app-v2/.domain-verify/`，跑一次 CLI 就往工作区里
 * 落一堆编译产物（那堆产物还一度替已经删掉的模块层文件"续命"，见 git 历史）。临时目录用完就删，
 * 工作区里不留东西。
 */
function loadDomain() {
  const root = join(tmpdir(), `blockout-domain-cjs-${process.pid}`);
  const outDirAbsolute = join(root, "out");
  const tsc = resolve(appDir, "node_modules/typescript/bin/tsc");
  if (!existsSync(tsc)) throw new Error(`找不到本机 TypeScript：${tsc}（先在 app-v2 里 npm install）`);
  if (!existsSync(resolve(appDir, "node_modules/zod"))) throw new Error(`找不到 app-v2/node_modules/zod（先在 app-v2 里 npm install）`);

  // 进程被 Ctrl-C 打断时也尽量收尾；清理失败不掩盖原本的报错
  const cleanup = () => { try { rmSync(root, { recursive: true, force: true }); } catch { /* Windows 上可能还占着文件，留着也无所谓 */ } };
  process.on("exit", cleanup);

  rmSync(root, { recursive: true, force: true });
  mkdirSync(outDirAbsolute, { recursive: true });
  execFileSync(process.execPath, [tsc, "-p", "tsconfig.domain-cjs.json", "--outDir", outDirAbsolute], { cwd: appDir, stdio: "inherit" });
  // app 是 ESM 包，编译产物是 CommonJS：放一个 package.json 免得 Node 认错模块类型
  writeFileSync(join(outDirAbsolute, "package.json"), '{"type":"commonjs"}\n', "utf8");
  /*
   * 编译产物在系统临时目录里，够不着 app-v2/node_modules，`require("zod")` 会 MODULE_NOT_FOUND。
   * 指向 app 的依赖目录建一个 junction，用完随临时目录一起删（Windows 上不需要管理员权限）。
   * 注意：**不能先 mkdir 出这个名字**，mklink 要求目标名还不存在。
   */
  try {
    execFileSync("cmd.exe", ["/c", "mklink", "/J", join(root, "node_modules"), resolve(appDir, "node_modules")], { stdio: "ignore" });
  } catch {
    throw new Error(`连不上 app-v2/node_modules（${root}\\node_modules 建不出来）。这个脚本要在 Windows 上跑：mklink /J 需要 cmd.exe。`);
  }

  const require = createRequire(pathToFileURL(join(root, "loader.cjs")));
  return {
    projectSchema: require(join(outDirAbsolute, "project-schema.js")).projectSchema,
    assertNotLegacyProject: require(join(outDirAbsolute, "project-schema.js")).assertNotLegacyProject,
    buildLocalUEDryRun: require(join(outDirAbsolute, "ue-plan.js")).buildLocalUEDryRun,
  };
}

const { projectSchema, assertNotLegacyProject, buildLocalUEDryRun } = loadDomain();

let raw;
try {
  raw = JSON.parse(readFileSync(projectPath, "utf8"));
} catch (error) {
  console.error(`读不了项目文件 ${projectPath}：${error.message}`);
  process.exit(1);
}

/*
 * 两道门，顺序不能反。
 *
 * 1. 旧格式先认出来：`assertNotLegacyProject` 是 app 侧**同一个**函数（项目读入口也用它），
 *    给出"这是模块层删除之前的旧项目文件"这句人话。少了它，旧文件只会撞出一串 Zod 路径，
 *    看不出是"太老"还是"文件坏了"。判断只有一处实现，不在这里抄第二份。
 * 2. 再走 schema：`concept` 现在是**必填**，缺几何的项目在这里就被挡下。
 */
try {
  assertNotLegacyProject(raw);
} catch (error) {
  console.error(`${basename(projectPath)} 读不了：${error.message}`);
  process.exit(1);
}
const parsed = projectSchema.safeParse(raw);
if (!parsed.success) {
  console.error(`${basename(projectPath)} 不是当前格式的项目（app 的 projectSchema 拒绝了它）：`);
  for (const issue of parsed.error.issues.slice(0, 12)) {
    console.error(`  · ${issue.path.length ? issue.path.join(".") : "(根)"}：${issue.message}`);
  }
  if (parsed.error.issues.length > 12) console.error(`  · …另有 ${parsed.error.issues.length - 12} 条`);
  process.exit(1);
}
const project = parsed.data;

/*
 * 空的 UE 计划必须是**明确报错**，不能是"成功、0 个"。
 *
 * 曾经就是这样翻车的：旧项目当时能通过 schema，`buildLocalUEDryRun` 返回 0 个 Actor，
 * 脚本成功退出 0，把已提交的 layouts/ue-plan/sunken-sanctum.blockout.actors.json
 * 从 104 个 Actor 覆盖成空数组（靠 git 还原）。现在 schema 那一关已经拦得住旧文件，
 * 这道仍然留着：拦"拓扑里确实没有可导出的积木"，那是另一种空。
 */
const plan = buildLocalUEDryRun(project);
if (plan.actorCount === 0) {
  console.error(`${basename(projectPath)} 的拓扑里没有任何可导入 UE 的积木（只有 port 或全空），拒绝写出空计划。`);
  process.exit(1);
}

/*
 * 输出结构必须与 ue_unreal_spawn.py 和已提交的 layouts/ue-plan/*.blockout.actors.json 保持一致，
 * 所以这里**只挑这五个键**（app 的 UEDryRunPlan 还带 createdAt / unplaced，那两个不往文件里写）：
 *   projectId / name / actorCount / actors / assemblyIssues
 */
const payload = {
  projectId: plan.projectId,
  name: project.name,
  actorCount: plan.actorCount,
  actors: plan.actors,
  /*
   * 兼容键，**恒为空数组**，不是"检查过、没问题"。
   *
   * 它原来装的是端口约束残差，由 `resolveAssembly` 复算"模块实例拼起来时端口对不对得上"。
   * 模块层删除后没有实例可拼、没有产出者，检查已经不存在了 —— 读成"0 = 通过了"是误读。
   * 键仍然写出来：scripts/ue_unreal_spawn.py 会读 `plan['assemblyIssues']`，
   * 已提交的 layouts/ue-plan/*.blockout.actors.json 也带着它，删键等于让仓库外的工具链少一项。
   * （app 侧同一取舍见 app-v2/src/domain/ue-plan.ts 的 UEDryRunPlan.assemblyIssues 注释。）
   */
  assemblyIssues: [],
};

const targetFile = outDir
  ? join(resolve(outDir), `${basename(projectPath, ".json")}.actors.json`)
  : join(dirname(projectPath), "ue-plan", `${basename(projectPath, ".json")}.actors.json`);
mkdirSync(dirname(targetFile), { recursive: true });
try {
  writeFileSync(targetFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
} catch (error) {
  console.error(`写不了 ${targetFile}：${error.message}`);
  process.exit(1);
}

console.log(`Exported ${targetFile}`);
console.log(`project: ${project.name}`);
console.log(`UE Actor plan: ${plan.actorCount} actors`);
console.log(`assemblyIssues: ${plan.assemblyIssues.length}（兼容键，恒为空；见本文件注释 —— 不是"检查过没问题"）`);
if (plan.unplaced.length) {
  console.log(`未落位区域 ${plan.unplaced.length} 个（按原点处理，必须在 UE 里手工定位）：`);
  for (const name of plan.unplaced) console.log(`  · ${name}`);
}
console.log(`sample actor: ${JSON.stringify(plan.actors[0] ?? null)}`);
