import { useTranslation } from "react-i18next";
import type { FinanceWorkspace } from "./api";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.tsx";

type WorkspaceContextBarProps = {
  workspace: FinanceWorkspace | null;
  workspaceBusy: boolean;
  copyFeedback?: string | null;
  onOpenWorkspace: () => void;
  onCopyLink: () => void;
  onShowDraftInvoices: () => void;
  onShowIssuedInvoices: () => void;
  onShowOverdueIssuedInvoices: () => void;
};

export function WorkspaceContextBar({
  workspace,
  workspaceBusy,
  copyFeedback,
  onOpenWorkspace,
  onCopyLink,
  onShowDraftInvoices,
  onShowIssuedInvoices,
  onShowOverdueIssuedInvoices
}: WorkspaceContextBarProps) {
  const { t } = useTranslation(["finance", "common"]);
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
            <LanguageSwitcher />
            <button type="button" className="button-secondary" onClick={onShowDraftInvoices}>
              {t("invoices.shortcut.drafts")}
            </button>
            <button type="button" className="button-secondary" onClick={onShowIssuedInvoices}>
              {t("invoices.shortcut.issued")}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={onShowOverdueIssuedInvoices}
            >
              {t("invoices.shortcut.collections")}
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
        <>
          <p className="workspace-context-pending">Завантаження workspace…</p>
          <LanguageSwitcher />
        </>
      ) : (
        <>
          <p className="workspace-context-pending">Workspace не обрано</p>
          <div className="workspace-context-actions">
            <LanguageSwitcher />
            <button type="button" onClick={onOpenWorkspace}>
              Відкрити
            </button>
          </div>
        </>
      )}
    </div>
  );
}
