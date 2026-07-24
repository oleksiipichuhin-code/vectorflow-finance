import type { FinanceWorkspace } from "./api";

type WorkspaceContextBarProps = {
  workspace: FinanceWorkspace | null;
  workspaceBusy: boolean;
  copyFeedback?: string | null;
  onOpenWorkspace: () => void;
  onCopyLink: () => void;
  onShowDraftInvoices: () => void;
};

export function WorkspaceContextBar({
  workspace,
  workspaceBusy,
  copyFeedback,
  onOpenWorkspace,
  onCopyLink,
  onShowDraftInvoices
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
          <div className="workspace-context-actions">
            <button type="button" className="button-secondary" onClick={onShowDraftInvoices}>
              Чернетки
            </button>
            <button type="button" className="button-secondary" onClick={onCopyLink}>
              Скопіювати посилання
            </button>
            <button type="button" className="button-secondary" onClick={onOpenWorkspace}>
              Змінити
            </button>
          </div>
          {copyFeedback ? <p className="workspace-context-feedback">{copyFeedback}</p> : null}
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
