/**
 * Dex MCP Bridge Extension for Pi
 *
 * Bridges Pi to Dex's MCP servers, enabling:
 * - Task management (create, complete, list)
 * - Calendar operations (today's events, upcoming events)
 *
 * Implementation: Spawns Python MCP servers as child processes,
 * communicates via JSON-RPC over stdin/stdout.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as readline from "node:readline";

// Types for JSON-RPC communication
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

// MCP Server connection manager
class McpServerConnection {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private rl: readline.Interface | null = null;
  private initialized = false;
  private serverName: string;
  private serverPath: string;
  private vaultPath: string;

  constructor(serverName: string, serverPath: string, vaultPath: string) {
    this.serverName = serverName;
    this.serverPath = serverPath;
    this.vaultPath = vaultPath;
  }

  async start(): Promise<void> {
    if (this.process) {
      return; // Already running
    }

    return new Promise((resolve, reject) => {
      // Spawn the Python MCP server
      this.process = spawn("python3", [this.serverPath], {
        env: {
          ...process.env,
          VAULT_PATH: this.vaultPath,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!this.process.stdout || !this.process.stdin) {
        reject(new Error(`Failed to start ${this.serverName} server`));
        return;
      }

      // Set up readline for parsing JSON-RPC responses
      this.rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      this.rl.on("line", (line) => {
        this.handleResponse(line);
      });

      this.process.stderr?.on("data", (data) => {
        // Log stderr but don't fail - MCP servers log to stderr
        console.error(`[${this.serverName}] ${data.toString()}`);
      });

      this.process.on("error", (err) => {
        console.error(`[${this.serverName}] Process error:`, err);
        this.cleanup();
        reject(err);
      });

      this.process.on("exit", (code) => {
        console.log(`[${this.serverName}] Process exited with code ${code}`);
        this.cleanup();
      });

      // Initialize the MCP connection
      this.initialize()
        .then(() => {
          this.initialized = true;
          resolve();
        })
        .catch(reject);
    });
  }

  private async initialize(): Promise<void> {
    // Send initialize request
    const initResult = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "pi-dex-bridge",
        version: "1.0.0",
      },
    });

    // Send initialized notification
    this.sendNotification("notifications/initialized", {});

    return initResult as Promise<void>;
  }

  private handleResponse(line: string): void {
    try {
      const response = JSON.parse(line) as JsonRpcResponse;

      if (response.id !== undefined) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      }
    } catch {
      // Ignore non-JSON lines (logging, etc.)
    }
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error(`${this.serverName} server not running`);
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.process!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.process?.stdin) {
      return;
    }

    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.process.stdin.write(JSON.stringify(notification) + "\n");
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const params: McpToolCallParams = { name };
    if (args) {
      params.arguments = args;
    }
    return this.sendRequest("tools/call", params);
  }

  private cleanup(): void {
    this.rl?.close();
    this.rl = null;
    this.process = null;
    this.initialized = false;

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Server connection closed"));
    }
    this.pendingRequests.clear();
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.cleanup();
    }
  }

  isRunning(): boolean {
    return this.process !== null && this.initialized;
  }
}

// Main extension export
export default function (pi: ExtensionAPI) {
  // Determine vault path (cwd or VAULT_PATH env)
  const vaultPath = process.env.VAULT_PATH || process.cwd();
  const mcpDir = path.join(vaultPath, "core", "mcp");

  // Create server connections
  const workServer = new McpServerConnection(
    "work",
    path.join(mcpDir, "work_server.py"),
    vaultPath
  );

  const calendarServer = new McpServerConnection(
    "calendar",
    path.join(mcpDir, "calendar_server.py"),
    vaultPath
  );

  // Helper to ensure server is running
  async function ensureWorkServer(): Promise<McpServerConnection> {
    if (!workServer.isRunning()) {
      await workServer.start();
    }
    return workServer;
  }

  async function ensureCalendarServer(): Promise<McpServerConnection> {
    if (!calendarServer.isRunning()) {
      await calendarServer.start();
    }
    return calendarServer;
  }

  // Extract text content from MCP response
  function extractContent(result: unknown): string {
    if (Array.isArray(result)) {
      // MCP returns array of content blocks
      const textContent = result.find((item: { type?: string }) => item.type === "text");
      if (textContent && "text" in textContent) {
        return textContent.text as string;
      }
    }
    return JSON.stringify(result, null, 2);
  }

  // Register the dex_task tool
  pi.registerTool({
    name: "dex_task",
    label: "Dex Task Management",
    description: `Manage tasks in Dex knowledge system.

Actions:
- create: Create a new task with title and pillar alignment
- complete: Mark a task as done (by task_id or title)
- list: List tasks with optional filters
- suggest: Get suggested tasks to focus on

Examples:
- Create task: action="create", title="Review PR #123", pillar="pillar_1"
- Complete task: action="complete", task_id="task-20260203-001"
- List P0 tasks: action="list", priority="P0"`,
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("create"),
        Type.Literal("complete"),
        Type.Literal("list"),
        Type.Literal("suggest"),
      ], { description: "Action to perform" }),

      // For create
      title: Type.Optional(Type.String({ description: "Task title (required for create)" })),
      pillar: Type.Optional(Type.String({ description: "Strategic pillar (required for create)" })),
      priority: Type.Optional(Type.String({ description: "Priority level: P0, P1, P2, P3" })),
      context: Type.Optional(Type.String({ description: "Additional context for the task" })),

      // For complete
      task_id: Type.Optional(Type.String({ description: "Task ID (e.g., task-20260203-001)" })),
      task_title: Type.Optional(Type.String({ description: "Task title to search for" })),

      // For list
      status: Type.Optional(Type.String({ description: "Filter by status: n (not started), s (started), b (blocked), d (done)" })),
      include_done: Type.Optional(Type.Boolean({ description: "Include completed tasks in list" })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const server = await ensureWorkServer();
        let result: unknown;

        switch (params.action) {
          case "create": {
            if (!params.title) {
              return {
                content: [{ type: "text", text: "Error: title is required for create action" }],
                details: { error: "missing_title" },
              };
            }
            if (!params.pillar) {
              return {
                content: [{ type: "text", text: "Error: pillar is required for create action" }],
                details: { error: "missing_pillar" },
              };
            }

            result = await server.callTool("create_task", {
              title: params.title,
              pillar: params.pillar,
              priority: params.priority || "P2",
              context: params.context,
            });
            break;
          }

          case "complete": {
            if (!params.task_id && !params.task_title) {
              return {
                content: [{ type: "text", text: "Error: task_id or task_title required for complete action" }],
                details: { error: "missing_identifier" },
              };
            }

            result = await server.callTool("update_task_status", {
              task_id: params.task_id,
              task_title: params.task_title,
              status: "d", // done
            });
            break;
          }

          case "list": {
            result = await server.callTool("list_tasks", {
              pillar: params.pillar,
              priority: params.priority,
              status: params.status,
              include_done: params.include_done || false,
            });
            break;
          }

          case "suggest": {
            result = await server.callTool("suggest_focus", {
              max_tasks: 3,
            });
            break;
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown action: ${params.action}` }],
              details: { error: "unknown_action" },
            };
        }

        const content = extractContent(result);
        return {
          content: [{ type: "text", text: content }],
          details: { action: params.action, raw: result },
        };

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { error: message },
        };
      }
    },
  });

  // Register the dex_calendar tool
  pi.registerTool({
    name: "dex_calendar",
    label: "Dex Calendar",
    description: `Access Apple Calendar events through Dex.

Actions:
- today: Get today's calendar events
- upcoming: Get events for a date range
- list_calendars: List available calendars
- next: Get the next upcoming event

Examples:
- Today's events: action="today", calendar="Work"
- This week: action="upcoming", calendar="Work", days=7`,
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("today"),
        Type.Literal("upcoming"),
        Type.Literal("list_calendars"),
        Type.Literal("next"),
      ], { description: "Action to perform" }),

      calendar: Type.Optional(Type.String({ description: "Calendar name (e.g., 'Work', 'Personal')" })),

      // For upcoming
      start_date: Type.Optional(Type.String({ description: "Start date (YYYY-MM-DD), defaults to today" })),
      days: Type.Optional(Type.Number({ description: "Number of days to look ahead (default: 7)" })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const server = await ensureCalendarServer();
        let result: unknown;

        switch (params.action) {
          case "list_calendars": {
            result = await server.callTool("calendar_list_calendars", {});
            break;
          }

          case "today": {
            if (!params.calendar) {
              return {
                content: [{ type: "text", text: "Error: calendar name required for today action" }],
                details: { error: "missing_calendar" },
              };
            }

            result = await server.callTool("calendar_get_today", {
              calendar_name: params.calendar,
            });
            break;
          }

          case "upcoming": {
            if (!params.calendar) {
              return {
                content: [{ type: "text", text: "Error: calendar name required for upcoming action" }],
                details: { error: "missing_calendar" },
              };
            }

            const today = new Date();
            const startDate = params.start_date || today.toISOString().split("T")[0];
            const days = params.days || 7;

            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + days);
            const endDateStr = endDate.toISOString().split("T")[0];

            result = await server.callTool("calendar_get_events", {
              calendar_name: params.calendar,
              start_date: startDate,
              end_date: endDateStr,
            });
            break;
          }

          case "next": {
            if (!params.calendar) {
              return {
                content: [{ type: "text", text: "Error: calendar name required for next action" }],
                details: { error: "missing_calendar" },
              };
            }

            result = await server.callTool("calendar_get_next_event", {
              calendar_name: params.calendar,
            });
            break;
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown action: ${params.action}` }],
              details: { error: "unknown_action" },
            };
        }

        const content = extractContent(result);
        return {
          content: [{ type: "text", text: content }],
          details: { action: params.action, raw: result },
        };

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { error: message },
        };
      }
    },
  });

  // Register convenience commands
  pi.registerCommand("dex-tasks", {
    description: "List your current Dex tasks",
    handler: async (args, ctx) => {
      ctx.ui.notify("Fetching tasks from Dex...", "info");
      try {
        const server = await ensureWorkServer();
        const result = await server.callTool("list_tasks", { include_done: false });
        const content = extractContent(result);
        ctx.ui.notify("Tasks loaded", "success");
        console.log(content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Error: ${message}`, "error");
      }
    },
  });

  pi.registerCommand("dex-today", {
    description: "Show today's calendar events",
    handler: async (args, ctx) => {
      ctx.ui.notify("Fetching today's events...", "info");
      try {
        const server = await ensureCalendarServer();
        // First list calendars to find the first one
        const calendarsResult = await server.callTool("calendar_list_calendars", {});
        const calendarsContent = extractContent(calendarsResult);

        // Parse to get first calendar
        let calendarName = "Calendar";
        try {
          const parsed = JSON.parse(calendarsContent);
          if (parsed.calendars && parsed.calendars.length > 0) {
            calendarName = parsed.calendars[0];
          }
        } catch {
          // Use default
        }

        const result = await server.callTool("calendar_get_today", { calendar_name: calendarName });
        const content = extractContent(result);
        ctx.ui.notify("Calendar loaded", "success");
        console.log(content);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Error: ${message}`, "error");
      }
    },
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    await workServer.stop();
    await calendarServer.stop();
  });

  // Log extension loaded
  console.log("Dex MCP Bridge extension loaded");
  console.log(`  Vault path: ${vaultPath}`);
  console.log(`  MCP servers: ${mcpDir}`);
}
