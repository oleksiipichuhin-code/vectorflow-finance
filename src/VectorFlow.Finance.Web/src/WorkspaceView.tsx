import { FormEvent } from "react";
import { Panel, StatusMessage } from "./components/Panel";
import type { FinanceWorkspace } from "./api";

type WorkspaceViewProps = {
  workspaceIdInput: string;
  workspace: FinanceWorkspace | null;
  workspaceBusy: boolean;
  workspaceError: string | null;
  onWorkspaceIdChange: (value: string) => void;
  onLoadWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  onCreateWorkspace: () => void;
};

export function WorkspaceView({
  workspaceIdInput,
  workspace,
  workspaceBusy,
  workspaceError,
  onWorkspaceIdChange,
  onLoadWorkspace,
  onCreateWorkspace
}: WorkspaceViewProps) {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Workspace</h1>
        <p className="lede">
          Завантажте існуючий фінансовий простір або створіть новий через реальний API.
        </p>
      </header>

      <Panel
        title="Робочий простір"
        headingId="workspace-heading"
        actions={
          <button type="button" onClick={onCreateWorkspace} disabled={workspaceBusy}>
            Створити новий
          </button>
        }
      >
        <form className="row-form" onSubmit={onLoadWorkspace}>
          <label>
            Ідентифікатор
            <input
              value={workspaceIdInput}
              onChange={(event) => onWorkspaceIdChange(event.target.value)}
              placeholder="GUID фінансового робочого простору"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" disabled={workspaceBusy}>
            Завантажити
          </button>
        </form>
        {workspaceBusy ? <StatusMessage>Завантаження робочого простору…</StatusMessage> : null}
        {workspaceError ? <StatusMessage tone="error">{workspaceError}</StatusMessage> : null}
        {workspace ? (
          <dl className="facts">
            <div>
              <dt>Назва</dt>
              <dd>{workspace.name}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{workspace.status}</dd>
            </div>
            <div>
              <dt>Валюта</dt>
              <dd>{workspace.defaultCurrency}</dd>
            </div>
            <div>
              <dt>Id</dt>
              <dd className="mono">{workspace.id}</dd>
            </div>
          </dl>
        ) : null}
      </Panel>
    </>
  );
}
