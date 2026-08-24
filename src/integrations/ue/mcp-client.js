const DEFAULT_PROTOCOL_VERSION = "2025-11-25";

export class UnrealMcpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "UnrealMcpError";
    this.details = details;
  }
}

export class UnrealMcpClient {
  constructor(options = {}) {
    this.endpoint = options.endpoint ?? "http://127.0.0.1:8000/mcp";
    this.clientName = options.clientName ?? "BlockOutToolsLocal";
    this.clientVersion = options.clientVersion ?? "0.1.0";
    this.protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    this.sessionId = null;
    this.nextRequestId = 1;
  }

  async connect() {
    const response = await this.#post(
      "initialize",
      {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: this.clientName,
          version: this.clientVersion,
        },
      },
      { includeSession: false },
    );

    this.sessionId = response.headers.get("mcp-session-id");
    if (!this.sessionId) {
      throw new UnrealMcpError("UE MCP did not return a session id.");
    }

    const payload = await response.json();
    this.protocolVersion = payload.result?.protocolVersion ?? this.protocolVersion;
    await this.notify("notifications/initialized", {});
    return payload.result;
  }

  async disconnect() {
    if (!this.sessionId) {
      return;
    }

    try {
      await fetch(this.endpoint, {
        method: "DELETE",
        headers: this.#headers(),
      });
    } finally {
      this.sessionId = null;
    }
  }

  async listTools() {
    return this.request("tools/list", {});
  }

  async callTool(name, argumentsValue = {}) {
    const result = await this.request("tools/call", {
      name,
      arguments: argumentsValue,
    });

    if (result.isError) {
      const message = result.content?.map((item) => item.text).filter(Boolean).join("\n");
      throw new UnrealMcpError(message || `UE MCP tool failed: ${name}`, { result });
    }

    return result;
  }

  async request(method, params = {}) {
    if (!this.sessionId) {
      await this.connect();
    }

    const response = await this.#post(method, params);
    const payload = await response.json();

    if (payload.error) {
      throw new UnrealMcpError(payload.error.message ?? `UE MCP request failed: ${method}`, {
        error: payload.error,
      });
    }

    return payload.result;
  }

  async notify(method, params = {}) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    });

    if (!response.ok) {
      throw new UnrealMcpError(`UE MCP notification failed with HTTP ${response.status}.`, {
        method,
      });
    }
  }

  async #post(method, params, options = {}) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.#headers(options.includeSession ?? true),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextRequestId++,
        method,
        params,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new UnrealMcpError(`UE MCP returned HTTP ${response.status}.`, {
        method,
        responseText,
      });
    }

    return response;
  }

  #headers(includeSession = true) {
    const headers = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "Mcp-Protocol-Version": this.protocolVersion,
    };

    if (includeSession && this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    return headers;
  }
}

export function readToolText(result) {
  return result.content?.map((item) => item.text).filter(Boolean).join("\n") ?? "";
}

