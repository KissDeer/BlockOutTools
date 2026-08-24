import { UnrealMcpClient, readToolText } from "../src/integrations/ue/mcp-client.js";

const client = new UnrealMcpClient({
  endpoint: process.env.BLOCKOUT_UE_MCP_URL,
});

try {
  const server = await client.connect();
  const toolsets = await client.callTool("list_toolsets");

  console.log(
    JSON.stringify(
      {
        connected: true,
        endpoint: client.endpoint,
        protocolVersion: server.protocolVersion,
        toolsets: readToolText(toolsets),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        connected: false,
        endpoint: client.endpoint,
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await client.disconnect();
}

