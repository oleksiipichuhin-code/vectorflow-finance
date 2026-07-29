import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addJournalEntryLine,
  createAccount,
  createJournalEntry,
  FinanceApiRequestError,
  getAccountByCode,
  getJournalEntry,
  getLedgerPostingByJournalEntry,
  listJournalEntries,
  postJournalEntry,
  postJournalEntryToLedger,
  removeJournalEntryLine,
  renameJournalEntry,
  type AccountType,
  type FinanceWorkspace,
  type JournalEntry,
  type LedgerPosting
} from "./api";
import { formatDate, formatMoney } from "./format";
import i18n from "./i18n";
import {
  ACCOUNT_TYPE_OPTIONS,
  loadAccountCache,
  rememberAccount,
  type CachedAccount
} from "./journalAccounts";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";

export type JournalStatusFilter = "" | "Draft" | "Posted";

type JournalIdChangeOptions = {
  replace?: boolean;
};

type JournalsViewProps = {
  workspace: FinanceWorkspace | null;
  initialPage?: number;
  initialStatus?: JournalStatusFilter;
  selectedJournalEntryId?: string | null;
  onDiscoveryChange?: (page: number, status: JournalStatusFilter) => void;
  onSelectedJournalEntryIdChange?: (
    journalEntryId: string | null,
    options?: JournalIdChangeOptions
  ) => void;
};

const PAGE_SIZE = 10;

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) {
    return 0;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function isAccountType(value: string): value is AccountType {
  return ACCOUNT_TYPE_OPTIONS.some((option) => option.id === value);
}

export function JournalsView({
  workspace,
  initialPage = 1,
  initialStatus = "",
  selectedJournalEntryId = null,
  onDiscoveryChange,
  onSelectedJournalEntryIdChange
}: JournalsViewProps) {
  const { t } = useTranslation(["finance", "common"]);

  const [statusFilter, setStatusFilter] = useState<JournalStatusFilter>(initialStatus);
  const [appliedStatus, setAppliedStatus] = useState<JournalStatusFilter>(initialStatus);
  const [page, setPage] = useState(() => (initialPage < 1 ? 1 : Math.floor(initialPage)));
  const previousWorkspaceId = useRef<string | null>(null);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState(() =>
    i18n.t("journals.defaultEntryName", { ns: "finance" })
  );
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [accountCode, setAccountCode] = useState("1000");
  const [accountName, setAccountName] = useState(() =>
    i18n.t("journals.defaultAccountName", { ns: "finance" })
  );
  const [accountType, setAccountType] = useState<AccountType>("Asset");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState<string | null>(null);
  const [accountCache, setAccountCache] = useState<CachedAccount[]>([]);

  const [detail, setDetail] = useState<JournalEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSuccess, setDetailSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [renameName, setRenameName] = useState("");
  const [lineAccountId, setLineAccountId] = useState("");
  const [lineSide, setLineSide] = useState<"debit" | "credit">("debit");
  const [lineAmount, setLineAmount] = useState("100.00");
  const [lineDescription, setLineDescription] = useState("");

  const [ledger, setLedger] = useState<LedgerPosting | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const workspaceId = workspace?.id ?? null;

  const typeLabel = useCallback(
    (accountTypeValue: string) =>
      isAccountType(accountTypeValue) ? t(`type.${accountTypeValue}`) : accountTypeValue,
    [t]
  );

  const formatCachedAccount = useCallback(
    (account: CachedAccount) =>
      `${account.code} · ${account.name} (${typeLabel(account.type)})`,
    [typeLabel]
  );

  const statusLabel = useCallback(
    (status: string) => {
      if (status === "Draft" || status === "Posted") {
        return t(`journalStatus.${status}`);
      }
      return status;
    },
    [t]
  );

  const refreshAccountCache = useCallback(() => {
    if (!workspaceId) {
      setAccountCache([]);
      return;
    }
    setAccountCache(loadAccountCache(workspaceId));
  }, [workspaceId]);

  const loadList = useCallback(async () => {
    if (!workspaceId) {
      setEntries([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const list = await listJournalEntries(workspaceId);
      setEntries(list);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : t("journals.listLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, t]);

  const loadDetail = useCallback(
    async (journalEntryId: string, options?: { replace?: boolean }) => {
      if (!workspaceId) {
        return;
      }

      setDetailLoading(true);
      setDetailError(null);
      setDetailSuccess(null);
      setLedgerError(null);
      try {
        const entry = await getJournalEntry(workspaceId, journalEntryId);
        setDetail(entry);
        setRenameName(entry.name);
        onSelectedJournalEntryIdChange?.(entry.id, options);

        if (entry.status === "Posted") {
          try {
            const posting = await getLedgerPostingByJournalEntry(workspaceId, entry.id);
            setLedger(posting);
          } catch (err) {
            setLedger(null);
            if (err instanceof FinanceApiRequestError && err.status === 404) {
              setLedgerError(null);
            } else {
              setLedgerError(
                err instanceof Error ? err.message : t("journals.ledgerLoadFailed")
              );
            }
          }
        } else {
          setLedger(null);
        }
      } catch (err) {
        setDetail(null);
        setLedger(null);
        setDetailError(
          err instanceof Error ? err.message : t("journals.detailLoadFailed")
        );
        if (err instanceof FinanceApiRequestError && err.status === 404) {
          onSelectedJournalEntryIdChange?.(null, { replace: true });
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [workspaceId, onSelectedJournalEntryIdChange, t]
  );

  useEffect(() => {
    refreshAccountCache();
  }, [refreshAccountCache]);

  useEffect(() => {
    if (previousWorkspaceId.current === null) {
      previousWorkspaceId.current = workspaceId;
      void loadList();
      return;
    }

    if (previousWorkspaceId.current !== workspaceId) {
      previousWorkspaceId.current = workspaceId;
      setStatusFilter("");
      setAppliedStatus("");
      setPage(1);
      setDetail(null);
      setLedger(null);
      onSelectedJournalEntryIdChange?.(null, { replace: true });
      onDiscoveryChange?.(1, "");
      void loadList();
      return;
    }

    void loadList();
  }, [workspaceId, loadList, onDiscoveryChange, onSelectedJournalEntryIdChange]);

  useEffect(() => {
    if (!selectedJournalEntryId) {
      setDetail(null);
      setLedger(null);
      setDetailError(null);
      return;
    }

    if (detail?.id === selectedJournalEntryId) {
      return;
    }

    void loadDetail(selectedJournalEntryId);
  }, [selectedJournalEntryId, detail?.id, loadDetail]);

  const filtered = useMemo(() => {
    if (!appliedStatus) {
      return entries;
    }
    return entries.filter((entry) => entry.status === appliedStatus);
  }, [entries, appliedStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
      onDiscoveryChange?.(safePage, appliedStatus);
    }
  }, [page, safePage, appliedStatus, onDiscoveryChange]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setAppliedStatus(statusFilter);
    setPage(1);
    onDiscoveryChange?.(1, statusFilter);
  }

  function clearFilters() {
    setStatusFilter("");
    setAppliedStatus("");
    setPage(1);
    onDiscoveryChange?.(1, "");
  }

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId) {
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    setAccountSuccess(null);
    try {
      const created = await createAccount(workspaceId, {
        code: accountCode,
        name: accountName,
        type: accountType
      });
      const next = rememberAccount(workspaceId, created);
      setAccountCache(next);
      setLineAccountId(created.id);
      setAccountSuccess(t("journals.accountCreateSuccess", { code: created.code }));
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t("journals.accountCreateFailed"));
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleLookupAccount() {
    if (!workspaceId) {
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    setAccountSuccess(null);
    try {
      const found = await getAccountByCode(workspaceId, accountCode);
      const next = rememberAccount(workspaceId, found);
      setAccountCache(next);
      setLineAccountId(found.id);
      setAccountName(found.name);
      setAccountType((found.type as AccountType) || "Asset");
      setAccountSuccess(t("journals.accountLookupSuccess", { code: found.code }));
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t("journals.accountLookupFailed"));
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleCreateEntry(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId) {
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const created = await createJournalEntry(workspaceId, createName);
      setCreateSuccess(t("journals.createSuccess", { name: created.name }));
      await loadList();
      await loadDetail(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("journals.createFailed"));
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !detail || detail.status !== "Draft") {
      return;
    }
    setActionBusy(true);
    setDetailError(null);
    setDetailSuccess(null);
    try {
      const updated = await renameJournalEntry(workspaceId, detail.id, renameName);
      setDetail(updated);
      setDetailSuccess(t("journals.renameSuccess"));
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : t("journals.renameFailed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAddLine(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !detail || detail.status !== "Draft") {
      return;
    }
    const amount = parseAmount(lineAmount);
    if (amount == null) {
      setDetailError(t("journals.lineAmountInvalid"));
      return;
    }
    if (!lineAccountId) {
      setDetailError(t("journals.lineAccountRequired"));
      return;
    }

    setActionBusy(true);
    setDetailError(null);
    setDetailSuccess(null);
    try {
      const updated = await addJournalEntryLine(workspaceId, detail.id, {
        financialAccountId: lineAccountId,
        debit: lineSide === "debit" ? amount : 0,
        credit: lineSide === "credit" ? amount : 0,
        description: lineDescription.trim() || null
      });
      setDetail(updated);
      setDetailSuccess(t("journals.lineAddSuccess"));
      setLineDescription("");
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : t("journals.lineAddFailed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRemoveLine(lineId: string) {
    if (!workspaceId || !detail || detail.status !== "Draft") {
      return;
    }
    setActionBusy(true);
    setDetailError(null);
    setDetailSuccess(null);
    try {
      const updated = await removeJournalEntryLine(workspaceId, detail.id, lineId);
      setDetail(updated);
      setDetailSuccess(t("journals.lineRemoveSuccess"));
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : t("journals.lineRemoveFailed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePostJournal() {
    if (!workspaceId || !detail || detail.status !== "Draft") {
      return;
    }
    setActionBusy(true);
    setDetailError(null);
    setDetailSuccess(null);
    try {
      const posted = await postJournalEntry(workspaceId, detail.id);
      setDetail(posted);
      setDetailSuccess(t("journals.postSuccess"));
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : t("journals.postFailed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePostToLedger() {
    if (!workspaceId || !detail || detail.status !== "Posted") {
      return;
    }
    setActionBusy(true);
    setDetailError(null);
    setDetailSuccess(null);
    setLedgerError(null);
    try {
      const posting = await postJournalEntryToLedger(workspaceId, detail.id);
      setLedger(posting);
      setDetailSuccess(t("journals.postToLedgerSuccess"));
      await loadList();
    } catch (err) {
      if (err instanceof FinanceApiRequestError && err.status === 409) {
        try {
          const existing = await getLedgerPostingByJournalEntry(workspaceId, detail.id);
          setLedger(existing);
          setDetailSuccess(t("journals.postToLedgerExists"));
        } catch (inner) {
          setDetailError(
            inner instanceof Error ? inner.message : t("journals.postToLedgerConflict")
          );
        }
      } else {
        setDetailError(err instanceof Error ? err.message : t("journals.postToLedgerFailed"));
      }
    } finally {
      setActionBusy(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setLedger(null);
    setDetailError(null);
    setDetailSuccess(null);
    onSelectedJournalEntryIdChange?.(null);
  }

  function accountLabel(accountId: string): string {
    const cached = accountCache.find((item) => item.id === accountId);
    return cached ? formatCachedAccount(cached) : accountId;
  }

  if (!workspace) {
    return (
      <Panel title={t("journals.title")} headingId="journals-heading">
        <StatusMessage>{t("journals.needWorkspace")}</StatusMessage>
      </Panel>
    );
  }

  return (
    <>
      <Panel title={t("journals.accountsTitle")} headingId="accounts-heading">
        <p className="meta">{t("journals.accountsHelp")}</p>
        <form className="filter-form" onSubmit={(event) => void handleCreateAccount(event)}>
          <label>
            {t("field.code")}
            <input
              value={accountCode}
              onChange={(event) => setAccountCode(event.target.value)}
              disabled={accountBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            {t("field.name")}
            <input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              disabled={accountBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            {t("field.type")}
            <select
              value={accountType}
              onChange={(event) => setAccountType(event.target.value as AccountType)}
              disabled={accountBusy}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {typeLabel(option.id)}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={accountBusy}>
              {accountBusy ? t("saving", { ns: "common" }) : t("createAction")}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={accountBusy}
              onClick={() => void handleLookupAccount()}
            >
              {t("journals.lookupByCode")}
            </button>
          </div>
        </form>
        {accountError ? <StatusMessage tone="error">{accountError}</StatusMessage> : null}
        {accountSuccess ? <StatusMessage tone="success">{accountSuccess}</StatusMessage> : null}
        {accountCache.length > 0 ? (
          <ul className="meta">
            {accountCache.slice(0, 8).map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setLineAccountId(account.id)}
                >
                  {formatCachedAccount(account)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <StatusMessage>{t("journals.accountCacheEmpty")}</StatusMessage>
        )}
      </Panel>

      <Panel title={t("journals.createTitle")} headingId="journal-create-heading">
        <form className="filter-form" onSubmit={(event) => void handleCreateEntry(event)}>
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
          <div className="filter-actions">
            <button type="submit" disabled={createBusy}>
              {createBusy ? t("creating", { ns: "common" }) : t("journals.createDraft")}
            </button>
          </div>
        </form>
        {createError ? <StatusMessage tone="error">{createError}</StatusMessage> : null}
        {createSuccess ? <StatusMessage tone="success">{createSuccess}</StatusMessage> : null}
      </Panel>

      <Panel title={t("journals.title")} headingId="journals-heading">
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            {t("field.status")}
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as JournalStatusFilter)}
              disabled={loading}
            >
              <option value="">{t("all", { ns: "common" })}</option>
              <option value="Draft">{t("journalStatus.Draft")}</option>
              <option value="Posted">{t("journalStatus.Posted")}</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={loading}>
              {t("applyFilter", { ns: "common" })}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={loading}
              onClick={clearFilters}
            >
              {t("clearFilter", { ns: "common" })}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={loading}
              onClick={() => void loadList()}
            >
              {t("refresh", { ns: "common" })}
            </button>
          </div>
        </form>

        <ListLoadState
          loading={loading}
          loadingMessage={t("journals.listLoading")}
          error={error}
          onRetry={() => void loadList()}
          empty={!loading && !error && filtered.length === 0}
          emptyMessage={t("journals.listEmpty")}
        />

        {!loading && !error && pageItems.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("journals.col.name")}</th>
                    <th>{t("journals.col.status")}</th>
                    <th>{t("journals.col.debit")}</th>
                    <th>{t("journals.col.credit")}</th>
                    <th>{t("journals.col.updated")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((entry) => {
                    const selected = entry.id === selectedJournalEntryId;
                    return (
                      <tr
                        key={entry.id}
                        data-row-id={entry.id}
                        className={selected ? "row-highlight row-selected" : undefined}
                      >
                        <td className="cell-wrap">{entry.name}</td>
                        <td>{statusLabel(entry.status)}</td>
                        <td>{formatMoney(entry.totalDebit, workspace.defaultCurrency)}</td>
                        <td>{formatMoney(entry.totalCredit, workspace.defaultCurrency)}</td>
                        <td>{formatDate(entry.updatedAtUtc)}</td>
                        <td>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={detailLoading}
                            onClick={() => void loadDetail(entry.id)}
                          >
                            {t("details", { ns: "common" })}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="filter-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={safePage <= 1 || loading}
                onClick={() => {
                  const next = safePage - 1;
                  setPage(next);
                  onDiscoveryChange?.(next, appliedStatus);
                }}
              >
                {t("back", { ns: "common" })}
              </button>
              <span className="meta">
                {t("journals.pageMeta", {
                  page: safePage,
                  totalPages,
                  count: filtered.length
                })}
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={safePage >= totalPages || loading}
                onClick={() => {
                  const next = safePage + 1;
                  setPage(next);
                  onDiscoveryChange?.(next, appliedStatus);
                }}
              >
                {t("next", { ns: "common" })}
              </button>
            </div>
          </>
        ) : null}
      </Panel>

      {selectedJournalEntryId || detail || detailLoading || detailError ? (
        <Panel title={t("journals.detailTitle")} headingId="journal-detail-heading">
          <div className="filter-actions">
            <button type="button" className="button-secondary" onClick={closeDetail}>
              {t("close", { ns: "common" })}
            </button>
          </div>
          {detailLoading ? <StatusMessage>{t("journals.detailLoading")}</StatusMessage> : null}
          {detailError ? <StatusMessage tone="error">{detailError}</StatusMessage> : null}
          {detailSuccess ? <StatusMessage tone="success">{detailSuccess}</StatusMessage> : null}

          {detail ? (
            <>
              <dl className="facts">
                <div>
                  <dt>{t("field.id")}</dt>
                  <dd className="mono">{detail.id}</dd>
                </div>
                <div>
                  <dt>{t("field.name")}</dt>
                  <dd>{detail.name}</dd>
                </div>
                <div>
                  <dt>{t("field.status")}</dt>
                  <dd>{statusLabel(detail.status)}</dd>
                </div>
                <div>
                  <dt>{t("journals.field.totalDebit")}</dt>
                  <dd>{formatMoney(detail.totalDebit, workspace.defaultCurrency)}</dd>
                </div>
                <div>
                  <dt>{t("journals.field.totalCredit")}</dt>
                  <dd>{formatMoney(detail.totalCredit, workspace.defaultCurrency)}</dd>
                </div>
                <div>
                  <dt>{t("journals.field.postedAt")}</dt>
                  <dd>{formatDate(detail.postedAtUtc)}</dd>
                </div>
              </dl>

              {detail.status === "Draft" ? (
                <>
                  <form className="filter-form" onSubmit={(event) => void handleRename(event)}>
                    <label>
                      {t("journals.field.rename")}
                      <input
                        value={renameName}
                        onChange={(event) => setRenameName(event.target.value)}
                        disabled={actionBusy}
                        required
                      />
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy}>
                        {t("journals.saveName")}
                      </button>
                    </div>
                  </form>

                  <form className="filter-form" onSubmit={(event) => void handleAddLine(event)}>
                    <h3>{t("journals.addLine")}</h3>
                    <label>
                      {t("journals.col.account")}
                      <select
                        value={lineAccountId}
                        onChange={(event) => setLineAccountId(event.target.value)}
                        disabled={actionBusy || accountCache.length === 0}
                        required
                        aria-label={t("journals.col.account")}
                      >
                        <option value="">{t("journals.selectAccount")}</option>
                        {accountCache.map((account) => (
                          <option key={account.id} value={account.id}>
                            {formatCachedAccount(account)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("journals.field.side")}
                      <select
                        value={lineSide}
                        onChange={(event) =>
                          setLineSide(event.target.value as "debit" | "credit")
                        }
                        disabled={actionBusy}
                        aria-label={t("journals.field.side")}
                      >
                        <option value="debit">{t("journals.side.debit")}</option>
                        <option value="credit">{t("journals.side.credit")}</option>
                      </select>
                    </label>
                    <label>
                      {t("journals.field.amount")}
                      <input
                        value={lineAmount}
                        onChange={(event) => setLineAmount(event.target.value)}
                        disabled={actionBusy}
                        inputMode="decimal"
                        required
                        aria-label={t("journals.field.amount")}
                      />
                    </label>
                    <label>
                      {t("journals.col.description")}
                      <input
                        value={lineDescription}
                        onChange={(event) => setLineDescription(event.target.value)}
                        disabled={actionBusy}
                        autoComplete="off"
                        aria-label={t("journals.col.description")}
                      />
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy || !lineAccountId}>
                        {t("journals.addLine")}
                      </button>
                    </div>
                  </form>
                </>
              ) : null}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("journals.col.sequence")}</th>
                      <th>{t("journals.col.account")}</th>
                      <th>{t("journals.col.debit")}</th>
                      <th>{t("journals.col.credit")}</th>
                      <th>{t("journals.col.description")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.length === 0 ? (
                      <tr>
                        <td colSpan={6}>{t("journals.linesEmpty")}</td>
                      </tr>
                    ) : (
                      detail.lines.map((line) => (
                        <tr key={line.id}>
                          <td>{line.sequence}</td>
                          <td className="cell-wrap">{accountLabel(line.financialAccountId)}</td>
                          <td>{formatMoney(line.debit, workspace.defaultCurrency)}</td>
                          <td>{formatMoney(line.credit, workspace.defaultCurrency)}</td>
                          <td className="cell-wrap">
                            {line.description ?? t("emDash", { ns: "common" })}
                          </td>
                          <td>
                            {detail.status === "Draft" ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={actionBusy}
                                onClick={() => void handleRemoveLine(line.id)}
                              >
                                {t("remove", { ns: "common" })}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="filter-actions">
                {detail.status === "Draft" ? (
                  <button
                    type="button"
                    disabled={
                      actionBusy ||
                      detail.lines.length === 0 ||
                      detail.totalDebit !== detail.totalCredit
                    }
                    title={
                      detail.totalDebit !== detail.totalCredit
                        ? t("journals.postUnbalancedTitle")
                        : undefined
                    }
                    onClick={() => void handlePostJournal()}
                  >
                    {t("journals.postJournal")}
                  </button>
                ) : null}
                {detail.status === "Posted" && !ledger ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handlePostToLedger()}
                  >
                    {t("journals.postToLedger")}
                  </button>
                ) : null}
              </div>

              {ledger ? (
                <div className="queue-banner" role="status">
                  <p className="queue-banner-title">{t("journals.ledgerBannerTitle")}</p>
                  <dl className="facts">
                    <div>
                      <dt>{t("journals.field.ledgerPostingId")}</dt>
                      <dd className="mono">{ledger.id}</dd>
                    </div>
                    <div>
                      <dt>{t("journals.field.journalEntryId")}</dt>
                      <dd className="mono">{ledger.journalEntryId}</dd>
                    </div>
                    <div>
                      <dt>{t("journals.field.postedAt")}</dt>
                      <dd>{formatDate(ledger.postedAtUtc)}</dd>
                    </div>
                    <div>
                      <dt>{t("journals.field.totals")}</dt>
                      <dd>
                        {formatMoney(ledger.totalDebit, workspace.defaultCurrency)} /{" "}
                        {formatMoney(ledger.totalCredit, workspace.defaultCurrency)}
                      </dd>
                    </div>
                  </dl>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("journals.col.sequence")}</th>
                          <th>{t("journals.col.account")}</th>
                          <th>{t("journals.col.debit")}</th>
                          <th>{t("journals.col.credit")}</th>
                          <th>{t("journals.col.description")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.sequence}</td>
                            <td className="cell-wrap">
                              {accountLabel(line.financialAccountId)}
                            </td>
                            <td>{formatMoney(line.debit, workspace.defaultCurrency)}</td>
                            <td>{formatMoney(line.credit, workspace.defaultCurrency)}</td>
                            <td className="cell-wrap">
                              {line.description ?? t("emDash", { ns: "common" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : detail.status === "Posted" ? (
                <StatusMessage>{t("journals.ledgerPending")}</StatusMessage>
              ) : null}
              {ledgerError ? <StatusMessage tone="error">{ledgerError}</StatusMessage> : null}
            </>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
