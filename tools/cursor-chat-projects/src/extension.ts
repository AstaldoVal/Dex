import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { getRecentChatsFromCursor, type CursorChat } from "./cursor-db";

const CONFIG_FILE = ".cursor/chat-projects.json";
const TREE_VIEW_ID = "cursorChatProjects.tree";
const DND_MIME = "application/vnd.code.tree.cursorchatprojects.tree";

interface ChatProject {
  id: string;
  name: string;
  conversationIds: string[];
}

interface ChatProjectsConfig {
  projects: ChatProject[];
  /** Optional titles for display (conversationId -> title) */
  conversationTitles?: Record<string, string>;
}

function getConfigPath(): string {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) return "";
  return path.join(workspace.uri.fsPath, CONFIG_FILE);
}

function loadConfig(): ChatProjectsConfig {
  const p = getConfigPath();
  if (!p || !fs.existsSync(p)) return { projects: [] };
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as ChatProjectsConfig;
    return { projects: data.projects || [], conversationTitles: data.conversationTitles || {} };
  } catch {
    return { projects: [] };
  }
}

function setConversationTitle(config: ChatProjectsConfig, id: string, title: string): void {
  if (!config.conversationTitles) config.conversationTitles = {};
  config.conversationTitles[id] = title;
}

function saveConfig(config: ChatProjectsConfig): void {
  const p = getConfigPath();
  if (!p) return;
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), "utf-8");
}

export type TreeItem =
  | { kind: "project"; project: ChatProject }
  | { kind: "chat"; project: ChatProject; conversationId: string };

function isChatItem(item: TreeItem): item is TreeItem & { kind: "chat" } {
  return item.kind === "chat";
}

function isProjectItem(item: TreeItem): item is TreeItem & { kind: "project" } {
  return item.kind === "project";
}

class ChatProjectsProvider
  implements
    vscode.TreeDataProvider<TreeItem>,
    vscode.TreeDragAndDropController<TreeItem>
{
  dropMimeTypes = [DND_MIME];
  dragMimeTypes = [DND_MIME];

  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    if (element.kind === "project") {
      const item = new vscode.TreeItem(
        element.project.name,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.id = element.project.id;
      item.contextValue = "project";
      return item;
    }
    const config = loadConfig();
    const title =
      config.conversationTitles?.[element.conversationId] ||
      (element.conversationId.length > 20
        ? element.conversationId.slice(0, 20) + "\u2026"
        : element.conversationId);
    const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);
    item.id = element.conversationId;
    item.tooltip = element.conversationId;
    item.contextValue = "chat";
    item.command = {
      command: "cursorChatProjects.openChat",
      title: "Open chat",
      arguments: [element.conversationId],
    };
    return item;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    const config = loadConfig();
    if (!element) {
      return config.projects.map((p) => ({ kind: "project" as const, project: p }));
    }
    if (element.kind === "project") {
      return element.project.conversationIds.map((cid) => ({
        kind: "chat" as const,
        project: element.project,
        conversationId: cid,
      }));
    }
    return [];
  }

  async handleDrag(
    source: TreeItem[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const chats = source.filter(isChatItem);
    if (chats.length === 0) return;
    dataTransfer.set(DND_MIME, new vscode.DataTransferItem(chats));
  }

  async handleDrop(
    target: TreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    if (!target || !isProjectItem(target)) return;
    const transferItem = dataTransfer.get(DND_MIME);
    if (!transferItem) return;
    const chats = transferItem.value as TreeItem[];
    const toMove = chats.filter(isChatItem);
    if (toMove.length === 0) return;

    const config = loadConfig();
    const targetProject = config.projects.find((p) => p.id === target.project.id);
    if (!targetProject) return;

    for (const chat of toMove) {
      const fromProject = config.projects.find((p) => p.id === chat.project.id);
      if (fromProject) {
        fromProject.conversationIds = fromProject.conversationIds.filter(
          (id) => id !== chat.conversationId
        );
      }
      if (!targetProject.conversationIds.includes(chat.conversationId)) {
        targetProject.conversationIds.push(chat.conversationId);
      }
    }
    saveConfig(config);
    this.refresh();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatProjectsProvider();
  const treeView = vscode.window.createTreeView(TREE_VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true,
    dragAndDropController: provider,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorChatProjects.createProject", async () => {
      const name = await vscode.window.showInputBox({
        prompt: "Project name",
        title: "Chat Projects",
      });
      if (!name?.trim()) return;
      const config = loadConfig();
      const id = "proj-" + Date.now();
      config.projects.push({ id, name: name.trim(), conversationIds: [] });
      saveConfig(config);
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cursorChatProjects.addChatToProject",
      async (node?: TreeItem) => {
        if (!node || node.kind !== "project") return;
        const config = loadConfig();
        const p = config.projects.find((x) => x.id === node.project.id);
        if (!p) return;

        let conversationId: string | undefined;
        let title: string | undefined;

        const recent = await getRecentChatsFromCursor();
        if (recent.length > 0) {
          const manualItem = { label: "Paste ID manually…", id: "" };
          const picks = [
            ...recent.map((c) => ({
              label: c.title,
              description: c.id,
              id: c.id,
              title: c.title,
            })),
            manualItem,
          ];
          const chosen = await vscode.window.showQuickPick(picks, {
            title: "Add chat to " + node.project.name,
            placeHolder: "Select a chat from your Cursor chats (same as in Agents panel)",
            matchOnDescription: true,
          });
          if (!chosen) return;
          if (chosen === manualItem || !(chosen as { id?: string }).id) {
            conversationId = await vscode.window.showInputBox({
              prompt: "Paste conversation ID",
              title: "Add chat to " + node.project.name,
            });
          } else {
            conversationId = (chosen as { id: string; title?: string }).id;
            title = (chosen as { title?: string }).title;
          }
        } else {
          conversationId = await vscode.window.showInputBox({
            prompt: "Paste conversation ID of the chat to add",
            title: "Add chat to " + node.project.name,
            placeHolder: "Conversation ID from chat or DB",
          });
        }

        if (!conversationId?.trim()) return;
        const id = conversationId.trim();
        if (!p.conversationIds.includes(id)) {
          p.conversationIds.push(id);
          if (title) setConversationTitle(config, id, title);
          saveConfig(config);
          provider.refresh();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorChatProjects.assignToProject", async () => {
      const config = loadConfig();
      if (config.projects.length === 0) {
        vscode.window.showInformationMessage(
          "Create a project first (Chat Projects: Create project)."
        );
        return;
      }
      const project = await vscode.window.showQuickPick(
        config.projects.map((p) => ({ label: p.name, project: p })),
        { title: "Select project" }
      );
      if (!project) return;

      let conversationId: string | undefined;
      let title: string | undefined;
      const recent = await getRecentChatsFromCursor();
      if (recent.length > 0) {
        const manualItem = { label: "Paste ID manually…", id: "" };
        const picks = [
          ...recent.map((c) => ({
            label: c.title,
            description: c.id,
            id: c.id,
            title: c.title,
          })),
          manualItem,
        ];
        const chosen = await vscode.window.showQuickPick(picks, {
          title: "Assign to " + project.project.name,
          placeHolder: "Select a chat from your Cursor chats (same as in Agents panel)",
          matchOnDescription: true,
        });
        if (!chosen) return;
        if (chosen === manualItem || !(chosen as { id?: string }).id) {
          conversationId = await vscode.window.showInputBox({
            prompt: "Paste conversation ID",
            title: "Assign to " + project.project.name,
          });
        } else {
          conversationId = (chosen as { id: string; title?: string }).id;
          title = (chosen as { title?: string }).title;
        }
      } else {
        conversationId = await vscode.window.showInputBox({
          prompt: "Paste conversation ID (from chat context or DB)",
          title: "Assign to " + project.project.name,
        });
      }

      if (!conversationId?.trim()) return;
      const id = conversationId.trim();
      const pid = config.projects.findIndex((p) => p.id === project.project.id);
      if (pid === -1) return;
      if (!config.projects[pid].conversationIds.includes(id)) {
        config.projects[pid].conversationIds.push(id);
        if (title) setConversationTitle(config, id, title);
        saveConfig(config);
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cursorChatProjects.removeFromProject",
      async (node?: TreeItem) => {
        if (!node || node.kind !== "chat") return;
        const config = loadConfig();
        const p = config.projects.find((x) => x.id === node.project.id);
        if (!p) return;
        p.conversationIds = p.conversationIds.filter(
          (id) => id !== node.conversationId
        );
        saveConfig(config);
        provider.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cursorChatProjects.moveToProject",
      async (node?: TreeItem) => {
        if (!node || node.kind !== "chat") return;
        const config = loadConfig();
        const others = config.projects.filter((p) => p.id !== node.project.id);
        if (others.length === 0) {
          vscode.window.showInformationMessage(
            "Create another project first to move this chat."
          );
          return;
        }
        const picked = await vscode.window.showQuickPick(
          others.map((p) => ({ label: p.name, project: p })),
          { title: "Move chat to project" }
        );
        if (!picked) return;
        const fromProject = config.projects.find((x) => x.id === node.project.id);
        const toProject = config.projects.find((x) => x.id === picked.project.id);
        if (!fromProject || !toProject) return;
        fromProject.conversationIds = fromProject.conversationIds.filter(
          (id) => id !== node.conversationId
        );
        if (!toProject.conversationIds.includes(node.conversationId)) {
          toProject.conversationIds.push(node.conversationId);
        }
        saveConfig(config);
        provider.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorChatProjects.refresh", () =>
      provider.refresh()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorChatProjects.focusView", async () => {
      await vscode.commands.executeCommand("cursorChatProjects.tree.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cursorChatProjects.openChat",
      async (conversationId: string) => {
        if (!conversationId) return;
        const tried = [
          "cursor.openConversation",
          "aichat.openConversation",
          "workbench.panel.aichat.view.openConversation",
        ];
        for (const cmd of tried) {
          try {
            await vscode.commands.executeCommand(cmd, conversationId);
            return;
          } catch {
            /* command may not exist */
          }
        }
        await vscode.env.clipboard.writeText(conversationId);
        vscode.window.showInformationMessage(
          "Cursor doesn't support opening a chat by ID yet. Conversation ID copied to clipboard — find this chat in the Agents panel (left sidebar)."
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "cursorChatProjects.quickOpen",
      async (prefixArg?: string) => {
        let prefix = typeof prefixArg === "string" ? prefixArg : "";
        if (!prefix) {
          prefix =
            (await vscode.window.showInputBox({
              prompt: "Path prefix for Quick Open (same as Cmd+P)",
              title: "Dex: Quick Open",
            })) ?? "";
        }
        if (!prefix) return;
        await vscode.commands.executeCommand("workbench.action.quickOpen", prefix);
      }
    )
  );

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
        const extAuthority = "dex.cursor-chat-projects";
        if (uri.authority !== extAuthority) return;
        const p = uri.path.replace(/^\//, "");
        if (p !== "quickopen") return;
        const params = new URLSearchParams(uri.query);
        const raw = params.get("path") ?? params.get("q") ?? "";
        if (!raw) return;
        let prefix: string;
        try {
          prefix = decodeURIComponent(raw);
        } catch {
          prefix = raw;
        }
        return vscode.commands.executeCommand("workbench.action.quickOpen", prefix);
      },
    })
  );
}

export function deactivate(): void {
  // no-op
}
