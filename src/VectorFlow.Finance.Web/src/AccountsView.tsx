import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { formatDate } from "./i18n/format.ts";
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

function isAccountType(value: string): value is AccountType {
  return ACCOUNT_TYPE_OPTIONS.some((option) => option.id === value);
}

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
  const { t } = useTranslation(["finance", "common"]);
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

  const typeLabel = useCallback(
    (accountType: string) =>
      isAccountType(accountType) ? t(`type.${accountType}`) : accountType,
    [t]
  );

  const statusLabel = useCallback(
    (accountStatus: string) => {
      if (accountStatus === "Active" || accountStatus === "Archived") {
        return t(`status.${accountStatus}`);
      }
      return accountStatus;
    },
    [t]
  );

  const loadAccounts = useCallback(
    async (workspaceId: string) => {
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
          error instanceof Error ? error.message : t("listLoadFailed")
        );
      } finally {
        if (seq === listSeq.current) {
          setListLoading(false);
        }
      }
    },
    [t]
  );

  const loadDetail = useCallback(
    async (workspaceId: string, accountId: string) => {
      if (!isAccountId(accountId)) {
        setDetail(null);
        setDetailError(t("detailInvalidId"));
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
        setEditType(isAccountType(next.type) ? next.type : "Asset");
        setDetailSuccess(t("detailLoaded"));
      } catch (error) {
        if (seq !== detailSeq.current) {
          return;
        }
        setDetail(null);
        if (error instanceof FinanceApiRequestError && error.status === 404) {
          setDetailError(t("detailNotFound"));
          onSelectedAccountIdChange?.(null, { replace: true });
        } else {
          setDetailError(
            error instanceof Error ? error.message : t("detailLoadFailed")
          );
        }
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedAccountIdChange, t]
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
      setCreateSuccess(
        t("createSuccess", { label: formatAccountLabel(created) })
      );
      await loadAccounts(workspace.id);
      onSelectedAccountIdChange?.(created.id);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : t("createFailed")
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
      setEditType(isAccountType(next.type) ? next.type : "Asset");
      setDetailSuccess(successMessage);
      await loadAccounts(workspace.id);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : t("detailMutateFailed")
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
      <Panel title={t("title")} headingId="accounts-heading">
        <StatusMessage>{t("needWorkspace")}</StatusMessage>
      </Panel>
    );
  }

  const filtersActive = hasActiveChartOfAccountsFilters(appliedFilters);
  const detailActive = detail?.status === "Active";

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="lede">{t("lede")}</p>
      </header>

      <Panel title={t("createTitle")} headingId="accounts-create-heading">
        <form className="filter-form" onSubmit={(event) => void handleCreate(event)}>
          <label>
            {t("field.code")}
            <input
              value={createCode}
              onChange={(event) => setCreateCode(event.target.value)}
              disabled={createBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            {t("field.name")}
            <input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              disabled={createBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            {t("field.type")}
            <select
              value={createType}
              onChange={(event) => setCreateType(event.target.value as AccountType)}
              disabled={createBusy}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {typeLabel(option.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={createBusy}>
              {createBusy ? t("saving", { ns: "common" }) : t("createAction")}
            </button>
          </div>
        </form>
        {createError ? <StatusMessage tone="error">{createError}</StatusMessage> : null}
        {createSuccess ? <StatusMessage tone="success">{createSuccess}</StatusMessage> : null}
      </Panel>

      <Panel
        title={t("listTitle")}
        headingId="accounts-list-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadAccounts(workspace.id)}
          >
            {listLoading ? t("loading", { ns: "common" }) : t("refresh", { ns: "common" })}
          </button>
        }
      >
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            {t("search", { ns: "common" })}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              disabled={listLoading}
              autoComplete="off"
            />
          </label>
          <label>
            {t("field.status")}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AccountStatusFilter)}
              disabled={listLoading}
            >
              <option value="">{t("all", { ns: "common" })}</option>
              <option value="Active">{statusLabel("Active")}</option>
              <option value="Archived">{statusLabel("Archived")}</option>
            </select>
          </label>
          <label>
            {t("field.type")}
            <select
              value={type}
              onChange={(event) => setType(event.target.value as AccountTypeFilter)}
              disabled={listLoading}
            >
              <option value="">{t("all", { ns: "common" })}</option>
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {typeLabel(option.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={listLoading}>
              {t("applyFilter", { ns: "common" })}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={listLoading || !filtersActive}
              onClick={clearFilters}
            >
              {t("clearFilter", { ns: "common" })}
            </button>
          </div>
        </form>

        <ListLoadState
          loading={listLoading && accounts.length === 0}
          loadingMessage={t("listLoading")}
          error={listError}
          onRetry={() => void loadAccounts(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && accounts.length === 0}
          emptyMessage={t("listEmpty")}
        />

        {!listError && accounts.length > 0 && filtered.length === 0 ? (
          <StatusMessage>{t("listFilteredEmpty")}</StatusMessage>
        ) : null}

        {!listError && filtered.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("field.code")}</th>
                    <th>{t("field.name")}</th>
                    <th>{t("field.type")}</th>
                    <th>{t("field.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((account) => (
                    <tr key={account.id} data-row-id={account.id}>
                      <td className="mono">{account.code}</td>
                      <td>{account.name}</td>
                      <td>{typeLabel(account.type)}</td>
                      <td>{statusLabel(account.status)}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => openAccount(account.id)}
                        >
                          {t("open", { ns: "common" })}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="meta">
              {t("listMeta", { shown: filtered.length, total: accounts.length })}
            </p>
          </>
        ) : null}
      </Panel>

      {selectedAccountId ? (
        <Panel
          title={t("detailTitle")}
          headingId="accounts-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeDetail}>
              {t("close", { ns: "common" })}
            </button>
          }
        >
          <ListLoadState
            loading={detailLoading && !detail}
            loadingMessage={t("detailLoading")}
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
                  <dt>{t("field.id")}</dt>
                  <dd className="mono">{detail.id}</dd>
                </div>
                <div>
                  <dt>{t("field.code")}</dt>
                  <dd className="mono">{detail.code}</dd>
                </div>
                <div>
                  <dt>{t("field.name")}</dt>
                  <dd>{detail.name}</dd>
                </div>
                <div>
                  <dt>{t("field.type")}</dt>
                  <dd>{typeLabel(detail.type)}</dd>
                </div>
                <div>
                  <dt>{t("field.status")}</dt>
                  <dd>{statusLabel(detail.status)}</dd>
                </div>
                <div>
                  <dt>{t("field.created")}</dt>
                  <dd>{formatDate(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>{t("field.updated")}</dt>
                  <dd>{formatDate(detail.updatedAt)}</dd>
                </div>
                {detail.archivedAt ? (
                  <div>
                    <dt>{t("field.archived")}</dt>
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
                        t("renameSuccess")
                      );
                    }}
                  >
                    <label>
                      {t("field.rename")}
                      <input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        disabled={actionBusy}
                        required
                      />
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy}>
                        {t("saveName")}
                      </button>
                    </div>
                  </form>

                  <form
                    className="filter-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void applyMutation(
                        () => changeAccountCode(workspace.id, detail.id, editCode.trim()),
                        t("codeSuccess")
                      );
                    }}
                  >
                    <label>
                      {t("field.changeCode")}
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
                        {t("saveCode")}
                      </button>
                    </div>
                  </form>

                  <form
                    className="filter-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void applyMutation(
                        () => changeAccountType(workspace.id, detail.id, editType),
                        t("typeSuccess")
                      );
                    }}
                  >
                    <label>
                      {t("field.changeType")}
                      <select
                        value={editType}
                        onChange={(event) => setEditType(event.target.value as AccountType)}
                        disabled={actionBusy}
                      >
                        {ACCOUNT_TYPE_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {typeLabel(option.id)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy}>
                        {t("saveType")}
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
                          t("archiveSuccess")
                        )
                      }
                    >
                      {t("archiveAction")}
                    </button>
                  </div>
                </div>
              ) : (
                <StatusMessage>{t("archivedReadOnly")}</StatusMessage>
              )}

              <div className="filter-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={detailLoading || actionBusy}
                  onClick={() => void loadDetail(workspace.id, detail.id)}
                >
                  {t("refreshFromApi")}
                </button>
                {onOpenAccountStatement ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onOpenAccountStatement(detail.id)}
                  >
                    {t("openAccountStatement")}
                  </button>
                ) : null}
                {onOpenJournals ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onOpenJournals()}
                  >
                    {t("openJournals")}
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
