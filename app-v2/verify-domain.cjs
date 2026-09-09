const fs = require("fs");
const path = require("path");

// The app is ESM, but this verification build intentionally emits CommonJS.
// Mark the ignored output directory so Node loads the generated .js files correctly.
fs.writeFileSync(
  path.join(__dirname, ".domain-verify", "package.json"),
  JSON.stringify({ type: "commonjs" })
);

const { projectSchema } = require("./.domain-verify/project-schema.js");
const { resolveAssembly } = require("./.domain-verify/assembly-resolver.js");
const { buildLocalUEDryRun } = require("./.domain-verify/ue-plan.js");
const { validateProject } = require("./.domain-verify/validation.js");

const files = [
  "../layouts/sunken-sanctum-spine.blockout.json",
  "../layouts/sunken-sanctum.blockout.json",
  "../layouts/souls-starter-floor-wall.blockout.json",
];

for (const file of files) {
  const proj = projectSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8")));
  const validation = validateProject(proj);
  const resolved = resolveAssembly(proj);
  const plan = buildLocalUEDryRun(proj);
  const blocks = proj.modules.flatMap((m) => m.blocks);
  const by = {};
  for (const b of blocks) by[b.type] = (by[b.type] || 0) + 1;

  console.log("================================================");
  console.log(file);
  console.log(`projectSchema: OK (schemaVersion=${proj.schemaVersion})`);
  console.log(`modules=${proj.modules.length} instances=${proj.instances.length} connections=${proj.connections.length}`);
  console.log(`blocks: ${JSON.stringify(by)}`);
  console.log(`validateProject issues: ${validation.length}`);
  console.log(`resolveAssembly issues: ${resolved.issues.length}`);
  for (const i of resolved.issues) console.log(`   · ${i.connectionId} ${i.kind} posErr=${i.positionError.toFixed(1)} rotErr=${i.rotationError.toFixed(1)}`);
  console.log(`UE dry-run actorCount: ${plan.actorCount}; assemblyIssues: ${plan.assemblyIssues.length}`);
  console.log(`sample syncKey: ${plan.actors[0]?.syncKey}`);
}
console.log("================================================");
console.log("DONE: real app domain code ran against all level files.");
