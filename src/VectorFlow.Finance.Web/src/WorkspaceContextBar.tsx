import type { FinanceWorkspace } from "./api";

type WorkspaceContextBarProps = {
  workspace: FinanceWorkspace | null;
  workspaceBusy: boolean;
  onOpenWorkspace: () => void;
};

export function WorkspaceContextBar({
  workspace,
  workspaceBusy,
  onOpenWorkspace
}: WorkspaceContextBarProps) {
  return (
    <div className="workspace-context" aria-live="polite">
      {workspace ? (
        <>
          <div className="workspace-context-copy">
            <span className="workspace-context-label">Активний workspace</span>
            <span className="workspace-context-name">{workspace.name}</span>
            <span className="workspace-context-meta">
              {workspace.status} · {workspace.defaultCurrency}
            </span>
          </div>
          <button type="button" className="button-secondary" onClick={onOpenWorkspace}>
            Змінити
          </button>
        </>
      ) : workspaceBusy ? (
        <p className="workspace-context-pending">Завантаження workspace…</p>
      ) : (
        <>
          <p className="workspace-context-pending">Workspace не обрано</p>
          <button type="button" onClick={onOpenWorkspace}>
            Відкрити
          </button>
        </>
      )}
    </div>
  );
}
