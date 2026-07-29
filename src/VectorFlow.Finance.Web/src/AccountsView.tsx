import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FinanceApiRequestError,
  archiveAccount,
  changeAccountCode,
  changeAccountType,
  createAccount,
  getAccount,
  listAccounts,
  renameAccount,
  type AccountType,
  type FinanceWorkspace,
  type FinancialAccount
} from "./api";
import {
  ACCOUNT_TYPE_OPTIONS,
  EMPTY_CHART_OF_ACCOUNTS_FILTERS,
  filterChartOfAccounts,
  formatAccountLabel,
  hasActiveChartOfAccountsFilters,
  isAccountId,
  type AccountStatusFilter,
  type AccountTypeFilter,
  type ChartOfAccountsFilters
} from "./chartOfAccounts";
import { formatDate } from "./format";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";

type AccountIdChangeOptions = {
  replace?: boolean;
};

type AccountsViewProps = {
  workspace: FinanceWorkspace | null;
  selectedAccountId?: string | null;
  initialQuery?: string;
  initialStatus?: AccountStatusFilter;
  initialType?: AccountTypeFilter;
  onSelectedAccountIdChange?: (
    accountId: string | null,
    options?: AccountIdChangeOptions
  ) => void;
  onFilterChange?: (
    query: string,
    status: AccountStatusFilter,
    type: AccountTypeFilter
  ) => void;
  onOpenAccountStatement?: (accountId: string) => void;
  onOpenJournals?: () => void;
};

export function AccountsView({
  workspace,
  selectedAccountId = null,
  initialQuery = "",
  initialStatus = "",
  initialType = "",
  onSelectedAccountIdChange,
  onFilterChange,
  onOpenAccountStatement,
  onOpenJournals
}: AccountsViewProps) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<AccountStatusFilter>(initialStatus);
  const [type, setType] = useState<AccountTypeFilter>(initialType);
  const [appliedFilters, setAppliedFilters] = useState<ChartOfAccountsFilters>({
    query: initialQuery,
    status: initialStatus,
    type: initialType
  });

  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<AccountType>("Asset");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [detail, setDetail] = useState<FinancialAccount | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSuccess, setDetailSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editType, setEditType] = useState<AccountType>("Asset");

  const listSeq = useRef(0);
  const detailSeq = useRef(0);

  const loadAccounts = useCallback(async (workspaceId: string) => {
    const seq = ++listSeq.current;
    setListLoading(true);
    setListError(null);
    try {
      const next = await listAccounts(workspaceId);
      if (seq !== listSeq.current) {
        return;
      }
      setAccounts(next);
    } catch (error) {
      if (seq !== listSeq.current) {
        return;
      }
      setAccounts([]);
      setListError(
        error instanceof Error ? error.message : "Не вдалося завантажити план рахунків."
      );
    } finally {
      if (seq === listSeq.current) {
        setListLoading(false);
      }
    }
  }, []);

  const loadDetail = useCallback(
    async (workspaceId: string, accountId: string) => {
      if (!isAccountId(accountId)) {
        setDetail(null);
        setDetailError("Некоректний ідентифікатор рахунку.");
        setDetailSuccess(null);
        return;
      }

      const seq = ++detailSeq.current;
      setDetailLoading(true);
      setDetailError(null);
      setDetailSuccess(null);
      try {
        const next = await getAccount(workspaceId, accountId);
        if (seq !== detailSeq.current) {
          return;
        }
        setDetail(next);
        setEditName(next.name);
        setEditCode(next.code);
        setEditType(
          ACCOUNT_TYPE_OPTIONS.some((option) => option.id === next.type)
            ? (next.type as AccountType)
            : "Asset"
        );
        setDetailSuccess("Рахунок завантажено з API.");
      } catch (error) {
        if (seq !== detailSeq.current) {
          return;
        }
        setDetail(null);
        if (error instanceof FinanceApiRequestError && error.status === 404) {
          setDetailError("Рахунок не знайдено у цьому workspace.");
          onSelectedAccountIdChange?.(null, { replace: true });
        } else {
          setDetailError(
            error instanceof Error ? error.message : "Не вдалося завантажити рахунок."
          );
        }
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedAccountIdChange]
  );

  useEffect(() => {
    if (!workspace) {
      setAccounts([]);
      setListError(null);
      setListLoading(false);
      setDetail(null);
      setDetailError(null);
      setDetailSuccess(null);
      return;
    }

    void loadAccounts(workspace.id);
    return () => {
      listSeq.current += 1;
    };
  }, [workspace, loadAccounts]);

  useEffect(() => {
    if (!workspace || !selectedAccountId) {
      setDetail(null);
      setDetailError(null);
      setDetailSuccess(null);
      return;
    }

    void loadDetail(workspace.id, selectedAccountId);
    return () => {
      detailSeq.current += 1;
    };
  }, [workspace, selectedAccountId, loadDetail]);

  const filtered = useMemo(
    () => filterChartOfAccounts(accounts, appliedFilters),
    [accounts, appliedFilters]
  );

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const next: ChartOfAccountsFilters = {
      query: query.trim(),
      status,
      type
    };
    setQuery(next.query);
    setAppliedFilters(next);
    onFilterChange?.(next.query, next.status, next.type);
  }

  function clearFilters() {
    setQuery("");
    setStatus("");
    setType("");
    setAppliedFilters(EMPTY_CHART_OF_ACCOUNTS_FILTERS);
    onFilterChange?.("", "", "");
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!workspace) {
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const created = await createAccount(workspace.id, {
        code: createCode.trim(),
        name: createName.trim(),
        type: createType
      });
      setCreateCode("");
      setCreateName("");
      setCreateType("Asset");
      setCreateSuccess(`Рахунок ${formatAccountLabel(created)} створено.`);
      await loadAccounts(workspace.id);
      onSelectedAccountIdChange?.(created.id);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Не вдалося створити рахунок."
      );
    } finally {
      setCreateBusy(false);
    }
  }

  async function applyMutation(
    action: () => Promise<FinancialAccount>,
    successMessage: string
  ) {
    if (!workspace || !detail) {
      return;
    }

    setActionBusy(true);
    setDetailError(null);
    setDetailSuccess(null);
    try {
      const next = await action();
      setDetail(next);
      setEditName(next.name);
      setEditCode(next.code);
      setEditType(
        ACCOUNT_TYPE_OPTIONS.some((option) => option.id === next.type)
          ? (next.type as AccountType)
          : "Asset"
      );
      setDetailSuccess(successMessage);
      await loadAccounts(workspace.id);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Не вдалося змінити рахунок."
      );
    } finally {
      setActionBusy(false);
    }
  }

  function openAccount(accountId: string) {
    onSelectedAccountIdChange?.(accountId);
  }

  function closeDetail() {
    setDetail(null);
    setDetailError(null);
    setDetailSuccess(null);
    onSelectedAccountIdChange?.(null);
  }

  if (!workspace) {
    return (
      <Panel title="Accounts" headingId="accounts-heading">
        <StatusMessage>Спочатку відкрийте finance workspace.</StatusMessage>
      </Panel>
    );
  }

  const filtersActive = hasActiveChartOfAccountsFilters(appliedFilters);
  const detailActive = detail?.status === "Active";

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Chart of accounts</p>
        <h1>Accounts</h1>
        <p className="lede">
          План рахунків workspace → пошук / тип / статус → деталі → rename / code / type /
          archive. Стан у shareable URL.
        </p>
      </header>

      <Panel title="Створити рахунок" headingId="accounts-create-heading">
        <form className="filter-form" onSubmit={(event) => void handleCreate(event)}>
          <label>
            Code
            <input
              value={createCode}
              onChange={(event) => setCreateCode(event.target.value)}
              disabled={createBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Name
            <input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              disabled={createBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Type
            <select
              value={createType}
              onChange={(event) => setCreateType(event.target.value as AccountType)}
              disabled={createBusy}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={createBusy}>
              {createBusy ? "Збереження…" : "Створити рахунок"}
            </button>
          </div>
        </form>
        {createError ? <StatusMessage tone="error">{createError}</StatusMessage> : null}
        {createSuccess ? <StatusMessage tone="success">{createSuccess}</StatusMessage> : null}
      </Panel>

      <Panel
        title="План рахунків"
        headingId="accounts-list-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadAccounts(workspace.id)}
          >
            {listLoading ? "Завантаження…" : "Оновити"}
          </button>
        }
      >
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            Пошук
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Код або назва"
              disabled={listLoading}
              autoComplete="off"
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AccountStatusFilter)}
              disabled={listLoading}
            >
              <option value="">Усі</option>
              <option value="Active">Active</option>
              <option value="Archived">Archived</option>
            </select>
          </label>
          <label>
            Type
            <select
              value={type}
              onChange={(event) => setType(event.target.value as AccountTypeFilter)}
              disabled={listLoading}
            >
              <option value="">Усі</option>
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={listLoading}>
              Застосувати фільтр
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={listLoading || !filtersActive}
              onClick={clearFilters}
            >
              Скинути
            </button>
          </div>
        </form>

        <ListLoadState
          loading={listLoading && accounts.length === 0}
          loadingMessage="Завантаження плану рахунків…"
          error={listError}
          onRetry={() => void loadAccounts(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && accounts.length === 0}
          emptyMessage="Немає рахунків у цьому workspace. Створіть перший рахунок вище."
        />

        {!listError && accounts.length > 0 && filtered.length === 0 ? (
          <StatusMessage>Немає рахунків за обраним фільтром.</StatusMessage>
        ) : null}

        {!listError && filtered.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((account) => (
                    <tr key={account.id} data-row-id={account.id}>
                      <td className="mono">{account.code}</td>
                      <td>{account.name}</td>
                      <td>{account.type}</td>
                      <td>{account.status}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => openAccount(account.id)}
                        >
                          Відкрити
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="meta">
              Показано {filtered.length} з {accounts.length}. Фільтри в URL:{" "}
              <span className="mono">accountQ</span>, <span className="mono">status</span>,{" "}
              <span className="mono">type</span>.
            </p>
          </>
        ) : null}
      </Panel>

      {selectedAccountId ? (
        <Panel
          title="Деталі рахунку"
          headingId="accounts-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeDetail}>
              Закрити
            </button>
          }
        >
          <ListLoadState
            loading={detailLoading && !detail}
            loadingMessage="Завантаження деталей…"
            error={detailError}
            onRetry={() => void loadDetail(workspace.id, selectedAccountId)}
            retryDisabled={detailLoading}
            empty={false}
            emptyMessage=""
          />

          {detailSuccess ? <StatusMessage tone="success">{detailSuccess}</StatusMessage> : null}

          {detail ? (
            <>
              <dl className="facts">
                <div>
                  <dt>Id</dt>
                  <dd className="mono">{detail.id}</dd>
                </div>
                <div>
                  <dt>Code</dt>
                  <dd className="mono">{detail.code}</dd>
                </div>
                <div>
                  <dt>Name</dt>
                  <dd>{detail.name}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{detail.type}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{detail.status}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(detail.updatedAt)}</dd>
                </div>
                {detail.archivedAt ? (
                  <div>
                    <dt>Archived</dt>
                    <dd>{formatDate(detail.archivedAt)}</dd>
                  </div>
                ) : null}
              </dl>

              {detailActive ? (
                <div className="stack-form">
                  <form
                    className="filter-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void applyMutation(
                        () => renameAccount(workspace.id, detail.id, editName.trim()),
                        "Назву рахунку оновлено."
                      );
                    }}
                  >
                    <label>
                      Rename
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        disabled={actionBusy}
                        required
                      />
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy}>
                        Зберегти назву
                      </button>
                    </div>
                  </form>

                  <form
                    className="filter-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void applyMutation(
                        () => changeAccountCode(workspace.id, detail.id, editCode.trim()),
                        "Код рахунку оновлено."
                      );
                    }}
                  >
                    <label>
                      Change code
                      <input
                        className="mono"
                        value={editCode}
                        onChange={(event) => setEditCode(event.target.value)}
                        disabled={actionBusy}
                        required
                      />
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy}>
                        Зберегти код
                      </button>
                    </div>
                  </form>

                  <form
                    className="filter-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void applyMutation(
                        () => changeAccountType(workspace.id, detail.id, editType),
                        "Тип рахунку оновлено."
                      );
                    }}
                  >
                    <label>
                      Change type
                      <select
                        value={editType}
                        onChange={(event) => setEditType(event.target.value as AccountType)}
                        disabled={actionBusy}
                      >
                        {ACCOUNT_TYPE_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy}>
                        Зберегти тип
                      </button>
                    </div>
                  </form>

                  <div className="filter-actions">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() =>
                        void applyMutation(
                          () => archiveAccount(workspace.id, detail.id),
                          "Рахунок заархівовано."
                        )
                      }
                    >
                      Archive account
                    </button>
                  </div>
                </div>
              ) : (
                <StatusMessage>
                  Archived рахунок лише для аудиту — зміни API відхиляє.
                </StatusMessage>
              )}

              <div className="filter-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={detailLoading || actionBusy}
                  onClick={() => void loadDetail(workspace.id, detail.id)}
                >
                  Оновити з API
                </button>
                {onOpenAccountStatement ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onOpenAccountStatement(detail.id)}
                  >
                    Account statement
                  </button>
                ) : null}
                {onOpenJournals ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onOpenJournals()}
                  >
                    Journals
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
