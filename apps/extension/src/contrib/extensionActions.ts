/*
 * Modified for the nongkode/gitstudio fork: this file is new.
 *
 * Extension actions — lets OTHER extensions put buttons into GitStudio's
 * Changes view and run a step before a commit, without GitStudio knowing what
 * those buttons do.
 *
 * An extension declares them in its own package.json:
 *
 *   "contributes": {
 *     "gitstudio.actions": [{
 *       "id": "myext.export",            // unique id
 *       "label": "Export",               // button text (tooltip for "toolbar")
 *       "icon": "cloud-download",        // codicon name, optional
 *       "command": "myext.export",       // any VS Code command
 *       "slot": "commit",                // "noRepo" | "commit" | "toolbar"
 *       "when": ["hasRepo"],             // all must hold (see ActionCondition)
 *       "style": "secondary",            // "primary" | "secondary"
 *       "order": 10
 *     }],
 *     "gitstudio.commitHandlers": [{
 *       "command": "myext.beforeCommit"  // called before every commit
 *     }]
 *   }
 *
 * An action's command is called with one argument, an ActionContext
 * ({ repoRoot?, workspaceFolder? }). A commit handler's command is called with
 * a CommitContext and returns (or resolves to) a CommitHandlerResult; it may
 * stage more files before returning — they go into the same commit.
 *
 * At runtime an extension can also change its buttons through GitStudio's
 * exported API: getExtension("gitstudio.gitstudio").exports.actions.setState(
 *   "myext.export", { visible, badge, label, tooltip, disabled }).
 */
import * as vscode from "vscode";

export type ActionSlot = "noRepo" | "commit" | "toolbar";

/** Conditions GitStudio evaluates itself. */
export type ActionCondition =
  | "noRepo"
  | "hasRepo"
  | "hasChanges"
  | "noChanges"
  | "hasStaged"
  | "clipboardHasGitUrl";

const CONDITIONS: readonly ActionCondition[] = [
  "noRepo",
  "hasRepo",
  "hasChanges",
  "noChanges",
  "hasStaged",
  "clipboardHasGitUrl",
];
const SLOTS: readonly ActionSlot[] = ["noRepo", "commit", "toolbar"];

interface ContributedAction {
  id: string;
  label: string;
  icon?: string;
  command: string;
  slot: ActionSlot;
  when: ActionCondition[];
  style: "primary" | "secondary";
  order: number;
  tooltip?: string;
  extensionId: string;
}

/** What an extension may change at runtime (setState). */
export interface ActionState {
  visible?: boolean;
  badge?: string;
  label?: string;
  tooltip?: string;
  disabled?: boolean;
}

/** One button as sent to the webview. */
export interface RenderedAction {
  id: string;
  label: string;
  icon?: string;
  slot: ActionSlot;
  style: "primary" | "secondary";
  tooltip?: string;
  badge?: string;
  disabled?: boolean;
}

export interface ViewFacts {
  hasRepo: boolean;
  hasChanges: boolean;
  hasStaged: boolean;
}

export interface ActionContext {
  repoRoot?: string;
  workspaceFolder?: string;
}

export interface CommitContext {
  repoRoot: string;
  message: string;
  amend: boolean;
  push: boolean;
}

export interface CommitHandlerResult {
  /** "cancel" stops the commit; anything else (or nothing) continues. */
  action?: "continue" | "cancel";
  /** Replaces the commit message. */
  message?: string;
  /** true: push after the commit (same review as Commit & Push). */
  push?: boolean;
}

/** The part of GitStudio's exported API other extensions use. */
export interface ExtensionActionsApi {
  setState(id: string, state: ActionState): void;
  refresh(): void;
}

const GIT_URL = /^(https?:\/\/\S+?(\.git)?\/?|git@[\w.-]+:[\w./-]+?(\.git)?|ssh:\/\/\S+)$/i;

export function looksLikeGitUrl(text: string): boolean {
  const t = (text || "").trim();
  if (!t || t.includes("\n") || t.length > 500) return false;
  if (!GIT_URL.test(t)) return false;
  // a plain web page is not a repository: only https URLs of known hosts or *.git
  if (/^https?:/i.test(t)) {
    return /\.git\/?$/i.test(t) || /^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com|codeberg\.org)\/[^/]+\/[^/]+/i.test(t);
  }
  return true;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export class ExtensionActions implements vscode.Disposable {
  private actions: ContributedAction[] = [];
  private handlers: { command: string; extensionId: string }[] = [];
  private readonly states = new Map<string, ActionState>();
  private facts: ViewFacts = { hasRepo: false, hasChanges: false, hasStaged: false };
  private clipboardGitUrl = false;
  private readonly changed = new vscode.EventEmitter<void>();
  /** Fires when what the view should show may have changed. */
  readonly onDidChange = this.changed.event;
  private readonly disposables: vscode.Disposable[] = [this.changed];

  readonly api: ExtensionActionsApi = {
    setState: (id, state) => {
      const prev = this.states.get(id) ?? {};
      this.states.set(id, { ...prev, ...state });
      this.changed.fire();
    },
    refresh: () => this.changed.fire(),
  };

  start(): vscode.Disposable {
    this.scan();
    this.disposables.push(
      vscode.extensions.onDidChange(() => {
        this.scan();
        this.changed.fire();
      }),
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused) void this.checkClipboard();
      }),
    );
    void this.checkClipboard();
    return this;
  }

  /** Reads every installed extension's contributions. */
  private scan(): void {
    const actions: ContributedAction[] = [];
    const handlers: { command: string; extensionId: string }[] = [];
    for (const ext of vscode.extensions.all) {
      const contributes = (ext.packageJSON as { contributes?: Record<string, unknown> })?.contributes;
      if (!contributes) continue;
      const list = contributes["gitstudio.actions"];
      if (Array.isArray(list)) {
        for (const raw of list as Record<string, unknown>[]) {
          const id = str(raw?.id);
          const command = str(raw?.command);
          const label = str(raw?.label);
          if (!id || !command || !label) continue;
          const slot = SLOTS.includes(raw.slot as ActionSlot) ? (raw.slot as ActionSlot) : "commit";
          const whenRaw: unknown[] = Array.isArray(raw.when) ? raw.when : typeof raw.when === "string" ? [raw.when] : [];
          const when = whenRaw.filter((c): c is ActionCondition => CONDITIONS.includes(c as ActionCondition));
          actions.push({
            id,
            label,
            command,
            slot,
            when,
            icon: str(raw.icon)?.replace(/^\$\((.*)\)$/, "$1"),
            style: raw.style === "primary" ? "primary" : "secondary",
            order: typeof raw.order === "number" ? raw.order : 100,
            tooltip: str(raw.tooltip),
            extensionId: ext.id,
          });
        }
      }
      const hs = contributes["gitstudio.commitHandlers"];
      if (Array.isArray(hs)) {
        for (const raw of hs as Record<string, unknown>[]) {
          const command = str(raw?.command);
          if (command) handlers.push({ command, extensionId: ext.id });
        }
      }
    }
    actions.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    this.actions = actions;
    this.handlers = handlers;
  }

  private async checkClipboard(): Promise<void> {
    // Only when some button cares, and only when the window gets focus — the
    // clipboard is never polled.
    if (!this.actions.some((a) => a.when.includes("clipboardHasGitUrl"))) return;
    let has = false;
    try {
      has = looksLikeGitUrl(await vscode.env.clipboard.readText());
    } catch {
      has = false;
    }
    if (has !== this.clipboardGitUrl) {
      this.clipboardGitUrl = has;
      this.changed.fire();
    }
  }

  /** Called by the Changes view whenever it pushes new state. */
  setFacts(facts: ViewFacts): boolean {
    const f = this.facts;
    if (f.hasRepo === facts.hasRepo && f.hasChanges === facts.hasChanges && f.hasStaged === facts.hasStaged) return false;
    this.facts = { ...facts };
    return true;
  }

  /** The view became visible: re-read the clipboard. */
  viewShown(): void {
    void this.checkClipboard();
  }

  private holds(c: ActionCondition): boolean {
    const f = this.facts;
    switch (c) {
      case "noRepo": return !f.hasRepo;
      case "hasRepo": return f.hasRepo;
      case "hasChanges": return f.hasChanges;
      case "noChanges": return f.hasRepo && !f.hasChanges;
      case "hasStaged": return f.hasStaged;
      case "clipboardHasGitUrl": return this.clipboardGitUrl;
    }
  }

  /** The buttons to show now. */
  rendered(): RenderedAction[] {
    const out: RenderedAction[] = [];
    for (const a of this.actions) {
      // a noRepo button only makes sense without a repository, whatever "when" says
      if (a.slot === "noRepo" && this.facts.hasRepo) continue;
      if (a.slot !== "noRepo" && !this.facts.hasRepo) continue;
      if (!a.when.every((c) => this.holds(c))) continue;
      const s = this.states.get(a.id) ?? {};
      if (s.visible === false) continue;
      out.push({
        id: a.id,
        label: s.label ?? a.label,
        icon: a.icon,
        slot: a.slot,
        style: a.style,
        tooltip: s.tooltip ?? a.tooltip,
        badge: s.badge,
        disabled: s.disabled,
      });
    }
    return out;
  }

  /** A button was clicked in the view. */
  async run(id: string, ctx: ActionContext): Promise<void> {
    const a = this.actions.find((x) => x.id === id);
    if (!a) return;
    try {
      await vscode.commands.executeCommand(a.command, ctx);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `GitStudio: "${a.label}" (${a.extensionId}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  get hasCommitHandlers(): boolean {
    return this.handlers.length > 0;
  }

  /**
   * Runs every commit handler in turn. Returns undefined to cancel the commit,
   * else the (possibly changed) message and push flag.
   */
  async beforeCommit(ctx: CommitContext): Promise<{ message: string; push: boolean } | undefined> {
    let message = ctx.message;
    let push = ctx.push;
    for (const h of this.handlers) {
      let r: CommitHandlerResult | undefined;
      try {
        r = await vscode.commands.executeCommand<CommitHandlerResult | undefined>(h.command, {
          ...ctx,
          message,
          push,
        });
      } catch (err) {
        const pick = await vscode.window.showErrorMessage(
          `GitStudio: the commit step of ${h.extensionId} failed: ${err instanceof Error ? err.message : String(err)}`,
          { modal: true },
          "Commit anyway",
        );
        if (pick !== "Commit anyway") return undefined;
        continue;
      }
      if (r?.action === "cancel") return undefined;
      if (typeof r?.message === "string" && r.message.trim()) message = r.message;
      if (typeof r?.push === "boolean") push = r.push;
    }
    return { message, push };
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

/** The one instance (the Changes view and the exported API share it). */
export const extensionActions = new ExtensionActions();
