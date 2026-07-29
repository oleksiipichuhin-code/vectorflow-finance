import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  ACCOUNT_TYPE_OPTIONS,
  formatAccountOption,
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

export function JournalsView({
  workspace,
  initialPage = 1,
  initialStatus = "",
  selectedJournalEntryId = null,
  onDiscoveryChange,
  onSelectedJournalEntryIdChange
}: JournalsViewProps) {
  const [statusFilter, setStatusFilter] = useState<JournalStatusFilter>(initialStatus);
  const [appliedStatus, setAppliedStatus] = useState<JournalStatusFilter>(initialStatus);
  const [page, setPage] = useState(() => (initialPage < 1 ? 1 : Math.floor(initialPage)));
  const previousWorkspaceId = useRef<string | null>(null);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("Проводка");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [accountCode, setAccountCode] = useState("1000");
  const [accountName, setAccountName] = useState("Каса");
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
      setError(err instanceof Error ? err.message : "Не вдалося завантажити journal entries.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

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
                err instanceof Error ? err.message : "Не вдалося завантажити ledger posting."
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
          err instanceof Error ? err.message : "Не вдалося завантажити journal entry."
        );
        if (err instanceof FinanceApiRequestError && err.status === 404) {
          onSelectedJournalEntryIdChange?.(null, { replace: true });
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [workspaceId, onSelectedJournalEntryIdChange]
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
      setAccountSuccess(`Рахунок ${created.code} створено.`);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Не вдалося створити рахунок.");
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
      setAccountSuccess(`Рахунок ${found.code} знайдено.`);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Не вдалося знайти рахунок.");
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
      setCreateSuccess(`Чернетку «${created.name}» створено.`);
      await loadList();
      await loadDetail(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Не вдалося створити journal entry.");
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
      setDetailSuccess("Назву оновлено.");
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Не вдалося перейменувати.");
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
      setDetailError("Сума рядка має бути невід’ємним числом.");
      return;
    }
    if (!lineAccountId) {
      setDetailError("Оберіть financial account для рядка.");
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
      setDetailSuccess("Рядок додано.");
      setLineDescription("");
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Не вдалося додати рядок.");
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
      setDetailSuccess("Рядок видалено.");
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Не вдалося видалити рядок.");
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
      setDetailSuccess("Journal entry проведено (Posted). Далі — Post to ledger.");
      await loadList();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Не вдалося провести journal entry.");
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
      setDetailSuccess("Ledger posting створено. Стан збережено на сервері.");
      await loadList();
    } catch (err) {
      if (err instanceof FinanceApiRequestError && err.status === 409) {
        try {
          const existing = await getLedgerPostingByJournalEntry(workspaceId, detail.id);
          setLedger(existing);
          setDetailSuccess("Ledger posting уже існує (ідемпотентно).");
        } catch (inner) {
          setDetailError(
            inner instanceof Error ? inner.message : "Ledger posting conflict без деталей."
          );
        }
      } else {
        setDetailError(err instanceof Error ? err.message : "Не вдалося створити ledger posting.");
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
    return cached ? formatAccountOption(cached) : accountId;
  }

  if (!workspace) {
    return (
      <Panel title="Journal entries" headingId="journals-heading">
        <StatusMessage>Спочатку відкрийте finance workspace.</StatusMessage>
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Рахунки (chart of accounts)" headingId="accounts-heading">
        <p className="meta">
          Для рядків journal entry потрібен <span className="mono">FinancialAccountId</span>.
          Створіть або знайдіть рахунок за кодом тут, або керуйте планом рахунків у{" "}
          <span className="mono">Accounts</span> (<span className="mono">view=accounts</span>).
          Оболонка також кешує використані рахунки в браузері для швидкого вибору в рядках.
        </p>
        <form className="filter-form" onSubmit={(event) => void handleCreateAccount(event)}>
          <label>
            Code
            <input
              value={accountCode}
              onChange={(event) => setAccountCode(event.target.value)}
              disabled={accountBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Name
            <input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              disabled={accountBusy}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Type
            <select
              value={accountType}
              onChange={(event) => setAccountType(event.target.value as AccountType)}
              disabled={accountBusy}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={accountBusy}>
              {accountBusy ? "Збереження…" : "Створити рахунок"}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={accountBusy}
              onClick={() => void handleLookupAccount()}
            >
              Знайти за кодом
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
                  {formatAccountOption(account)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <StatusMessage>Кеш рахунків порожній — створіть Asset і Revenue для першої проводки.</StatusMessage>
        )}
      </Panel>

      <Panel title="Новий journal entry" headingId="journal-create-heading">
        <form className="filter-form" onSubmit={(event) => void handleCreateEntry(event)}>
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
          <div className="filter-actions">
            <button type="submit" disabled={createBusy}>
              {createBusy ? "Створення…" : "Створити чернетку"}
            </button>
          </div>
        </form>
        {createError ? <StatusMessage tone="error">{createError}</StatusMessage> : null}
        {createSuccess ? <StatusMessage tone="success">{createSuccess}</StatusMessage> : null}
      </Panel>

      <Panel title="Journal entries" headingId="journals-heading">
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as JournalStatusFilter)}
              disabled={loading}
            >
              <option value="">Усі</option>
              <option value="Draft">Draft</option>
              <option value="Posted">Posted</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={loading}>
              Застосувати
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={loading}
              onClick={clearFilters}
            >
              Скинути
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={loading}
              onClick={() => void loadList()}
            >
              Оновити
            </button>
          </div>
        </form>

        <ListLoadState
          loading={loading}
          loadingMessage="Завантаження journal entries…"
          error={error}
          onRetry={() => void loadList()}
          empty={!loading && !error && filtered.length === 0}
          emptyMessage="Немає journal entries у цьому workspace."
        />

        {!loading && !error && pageItems.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Updated</th>
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
                        <td>{entry.status}</td>
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
                            Деталі
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
                Назад
              </button>
              <span className="meta">
                Сторінка {safePage} з {totalPages} · {filtered.length} записів
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
                Далі
              </button>
            </div>
          </>
        ) : null}
      </Panel>

      {selectedJournalEntryId || detail || detailLoading || detailError ? (
        <Panel title="Journal entry detail" headingId="journal-detail-heading">
          <div className="filter-actions">
            <button type="button" className="button-secondary" onClick={closeDetail}>
              Закрити
            </button>
          </div>
          {detailLoading ? <StatusMessage>Завантаження деталі…</StatusMessage> : null}
          {detailError ? <StatusMessage tone="error">{detailError}</StatusMessage> : null}
          {detailSuccess ? <StatusMessage tone="success">{detailSuccess}</StatusMessage> : null}

          {detail ? (
            <>
              <dl className="facts">
                <div>
                  <dt>Id</dt>
                  <dd className="mono">{detail.id}</dd>
                </div>
                <div>
                  <dt>Name</dt>
                  <dd>{detail.name}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{detail.status}</dd>
                </div>
                <div>
                  <dt>Total debit</dt>
                  <dd>{formatMoney(detail.totalDebit, workspace.defaultCurrency)}</dd>
                </div>
                <div>
                  <dt>Total credit</dt>
                  <dd>{formatMoney(detail.totalCredit, workspace.defaultCurrency)}</dd>
                </div>
                <div>
                  <dt>Posted at</dt>
                  <dd>{formatDate(detail.postedAtUtc)}</dd>
                </div>
              </dl>

              {detail.status === "Draft" ? (
                <>
                  <form className="filter-form" onSubmit={(event) => void handleRename(event)}>
                    <label>
                      Rename
                      <input
                        value={renameName}
                        onChange={(event) => setRenameName(event.target.value)}
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

                  <form className="filter-form" onSubmit={(event) => void handleAddLine(event)}>
                    <h3>Додати рядок</h3>
                    <label>
                      Account
                      <select
                        value={lineAccountId}
                        onChange={(event) => setLineAccountId(event.target.value)}
                        disabled={actionBusy || accountCache.length === 0}
                        required
                      >
                        <option value="">Оберіть рахунок…</option>
                        {accountCache.map((account) => (
                          <option key={account.id} value={account.id}>
                            {formatAccountOption(account)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Side
                      <select
                        value={lineSide}
                        onChange={(event) =>
                          setLineSide(event.target.value as "debit" | "credit")
                        }
                        disabled={actionBusy}
                      >
                        <option value="debit">Debit</option>
                        <option value="credit">Credit</option>
                      </select>
                    </label>
                    <label>
                      Amount
                      <input
                        value={lineAmount}
                        onChange={(event) => setLineAmount(event.target.value)}
                        disabled={actionBusy}
                        inputMode="decimal"
                        required
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={lineDescription}
                        onChange={(event) => setLineDescription(event.target.value)}
                        disabled={actionBusy}
                        autoComplete="off"
                      />
                    </label>
                    <div className="filter-actions">
                      <button type="submit" disabled={actionBusy || !lineAccountId}>
                        Додати рядок
                      </button>
                    </div>
                  </form>
                </>
              ) : null}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Account</th>
                      <th>Debit</th>
                      <th>Credit</th>
                      <th>Description</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.length === 0 ? (
                      <tr>
                        <td colSpan={6}>Рядків ще немає.</td>
                      </tr>
                    ) : (
                      detail.lines.map((line) => (
                        <tr key={line.id}>
                          <td>{line.sequence}</td>
                          <td className="cell-wrap">{accountLabel(line.financialAccountId)}</td>
                          <td>{formatMoney(line.debit, workspace.defaultCurrency)}</td>
                          <td>{formatMoney(line.credit, workspace.defaultCurrency)}</td>
                          <td className="cell-wrap">{line.description ?? "—"}</td>
                          <td>
                            {detail.status === "Draft" ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={actionBusy}
                                onClick={() => void handleRemoveLine(line.id)}
                              >
                                Видалити
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
                        ? "Проводка має балансувати (debit = credit)"
                        : undefined
                    }
                    onClick={() => void handlePostJournal()}
                  >
                    Post journal entry
                  </button>
                ) : null}
                {detail.status === "Posted" && !ledger ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handlePostToLedger()}
                  >
                    Post to ledger
                  </button>
                ) : null}
              </div>

              {ledger ? (
                <div className="queue-banner" role="status">
                  <p className="queue-banner-title">Ledger posting</p>
                  <dl className="facts">
                    <div>
                      <dt>Ledger posting id</dt>
                      <dd className="mono">{ledger.id}</dd>
                    </div>
                    <div>
                      <dt>Journal entry id</dt>
                      <dd className="mono">{ledger.journalEntryId}</dd>
                    </div>
                    <div>
                      <dt>Posted at</dt>
                      <dd>{formatDate(ledger.postedAtUtc)}</dd>
                    </div>
                    <div>
                      <dt>Totals</dt>
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
                          <th>#</th>
                          <th>Account</th>
                          <th>Debit</th>
                          <th>Credit</th>
                          <th>Description</th>
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
                            <td className="cell-wrap">{line.description ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : detail.status === "Posted" ? (
                <StatusMessage>
                  Journal entry Posted. Ledger posting ще не створено — натисніть Post to ledger.
                </StatusMessage>
              ) : null}
              {ledgerError ? <StatusMessage tone="error">{ledgerError}</StatusMessage> : null}
            </>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
