import { connect } from "node:net";

const host = process.env.LAYOUT_TOOLS_HOST ?? "127.0.0.1";
const browserHost = ["0.0.0.0", "::", "[::]"].includes(host) ? "127.0.0.1" : host;
const port = Number.parseInt(process.env.LAYOUT_TOOLS_PORT ?? "4173", 10);
const mode = process.argv[2] ?? "check";
const url = `http://${browserHost}:${port}/`;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("LAYOUT_TOOLS_PORT must be an integer between 1 and 65535.");
  process.exit(3);
}

if (Number.parseInt(process.versions.node.split(".")[0], 10) < 20) {
  console.error(`Node.js 20 or newer is required. Installed version: ${process.version}`);
  process.exit(3);
}

async function isLayoutTools() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok && (await response.text()).includes("<title>LayoutTools</title>");
  } catch {
    return false;
  }
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = connect({ host: browserHost, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

if (mode === "check") {
  if (await isLayoutTools()) {
    console.log(`LayoutTools is already running at ${url}`);
    process.exit(0);
  }

  process.exit(await isPortOpen() ? 2 : 1);
}

if (mode === "wait") {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isLayoutTools()) {
      console.log(`LayoutTools started at ${url}`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.error("LayoutTools did not become ready within 15 seconds.");
  console.error("Review the LayoutTools Server window for the startup error.");
  process.exit(3);
}

console.error(`Unknown launcher mode: ${mode}`);
process.exit(3);
