# Accrual

## Purpose

`Accrual` is the Finance-owned document aggregate that records revenue or expense recognition within one `FinanceWorkspace`.

Accruals are distinct from invoices, payments, and general-ledger postings. Those concerns remain later slices.

## Aggregate ownership and scope (F4F)

- Owned by the Finance product.
- Every accrual is scoped by `FinanceWorkspaceId`.
- Cross-workspace access is not modeled in Domain.

## Aggregate state (F4F)

| Field | Meaning |
|-------|---------|
| `Id` | Finance-owned `AccrualId` |
| `FinanceWorkspaceId` | Owning finance workspace |
| `Type` | `Revenue` or `Expense` |
| `Amount` | Single positive `decimal` (no lines) |
| `Currency` | Accrual currency (`Currency` value object) |
| `RecognitionDate` | Required recognition calendar instant (`DateTimeOffset`); past and future allowed; immutable after recognition |
| `Description` | Required trimmed text (max 500; same as invoice/journal line descriptions) |
| `SourceInvoiceId` | Optional `InvoiceId`; existence is not validated in Domain |
| `Status` | `Draft`, `Recognized`, or `Reversed` |
| `CreatedAt` / `UpdatedAt` | UTC-oriented timestamps (`DateTimeOffset`) |
| `RecognizedAt` | Set once on recognize |
| `ReversedAt` | Set once on reverse |
| `ReversalReason` | Required trimmed reason when reversed (max 500) |

## Types

MVP supports only:

| Value | Name |
|------:|------|
| 1 | Revenue |
| 2 | Expense |

Deferred type extensions: tax, payroll, depreciation, prepaid, deferred revenue, custom user-defined types.

## Financial model

- One amount per accrual; no `AccrualLine`, itemization, quantity/unit price, tax breakdown, or FX conversion.
- `Amount > 0`.
- Floating-point types are prohibited.
- Amount and currency are separate fields (same posture as Invoice currency mutations).

## Lifecycle

| Status | Meaning |
|--------|---------|
| Draft | Type, money, recognition date, description, and optional source invoice may change |
| Recognized | Financial and source fields immutable; may reverse |
| Reversed | Terminal; immutable |

Transitions:

- Create → Draft
- Draft → Recognized (`Recognize`)
- Recognized → Reversed (`Reverse`)

Forbidden:

- Draft → Reversed
- Recognized → Recognized
- any transition out of Reversed
- return to Draft

Recognition is always full; partial recognition / installments are out of scope.

## Draft mutations

Allowed only while `Draft`:

- `ChangeType`
- `ChangeAmount`
- `ChangeCurrency`
- `ChangeRecognitionDate`
- `ChangeDescription`
- `ChangeSourceInvoice` (set or clear)

No-op when the normalized value is unchanged: no timestamp update and no domain event (Invoice convention).

After `Recognized`, financial and source fields are immutable.

## Recognition

Requires `Draft` and caller-supplied `recognizedAt`. Success sets `Recognized`, stores `RecognizedAt` once, and raises `AccrualRecognized`. Does not post to the ledger or call external services.

## Reversal

Requires `Recognized`, non-blank trimmed reason, and caller-supplied `reversedAt`. Success sets `Reversed`, stores `ReversedAt` and `ReversalReason`, and raises `AccrualReversed`.

F4F does not create a compensating accrual. Ledger correction remains deferred.

## Domain events

Following Invoice naming (no `DomainEvent` suffix):

- `AccrualCreated`
- `AccrualRecognized`
- `AccrualReversed`

No integration events, message contracts, or ledger commands.

## Invariants (summary)

- Non-empty `AccrualId` and `FinanceWorkspaceId`
- Defined `AccrualType` (`Revenue` / `Expense` only)
- `Amount > 0`
- Valid `Currency`
- Required recognition date (any `DateTimeOffset`; no timezone invention)
- Required description (trim; max 500)
- Optional `InvoiceId` only; Domain does not verify invoice existence
- Lifecycle transitions as above
- Monotonic `occurredAt` / transition timestamps relative to `CreatedAt` / `UpdatedAt`

## Out of scope for F4F

- Application handlers and persistence
- HTTP surface
- Automatic invoice → accrual creation
- Uniqueness by `InvoiceId`
- Repository queries / EF foreign keys
- Journal entry or ledger posting linkage
- Payment allocation
- Authorization
- Compensating accrual on reverse
- Concurrency token / aggregate version
- Public `Reconstitute` (not used by existing Domain aggregates)

## Application boundary (F4G)

Application use cases over the F4F aggregate (no persistence implementation, no HTTP):

- create accrual in an existing finance workspace;
- get accrual by id (workspace-scoped);
- list accruals for a finance workspace (CreatedAt descending, then AccrualId descending; empty list when none);
- list accruals for a finance workspace with paging (`page`, `pageSize`, optional exact `status` of `Draft`, `Recognized`, or `Reversed`; CreatedAt descending, then AccrualId descending; empty page when none; returns `items`, `page`, `pageSize`, `totalCount`);
- list accruals by source invoice id within a finance workspace (CreatedAt descending, then AccrualId descending; empty list when none; multiple accruals may share one SourceInvoiceId; Invoice existence is not validated);
- draft mutations: type, amount, currency, recognition date, description, source invoice (set/clear via nullable id);
- recognize accrual (`Draft` → `Recognized`);
- reverse accrual (`Recognized` → `Reversed`).

`IAccrualRepository` is the Application persistence port (`GetByIdAsync`, `ListByWorkspaceAsync`, `ListPagedAsync`, and `ListBySourceInvoiceAsync` always workspace-scoped, `AddAsync`, `SaveChangesAsync`). Paged listing requires `page >= 1` and `1 <= pageSize <= 100`. Optional paged `status` filter is exact enum match only. Remaining search and filters (CreatedAt range, text) remain later slices.

Result mapping follows Invoice Application:

- `ApplicationResult<AccrualDto>`;
- `ArgumentException` → ValidationFailed;
- `InvalidOperationException` → Conflict;
- missing / cross-workspace aggregate → NotFound;
- missing finance workspace on create → NotFound.

Timestamps come from `IClock.UtcNow` inside handlers (commands do not carry mutation timestamps). Create generates `AccrualId` via `AccrualId.New()`.

Source invoice existence is **not** checked in Application (same posture as Domain). Recognize/Reverse do not post to the ledger.

## Persistence (F4H)

Accrual aggregates are stored via EF Core in Infrastructure:

- `AccrualRepository` implements `IAccrualRepository` with workspace-scoped `GetByIdAsync`, `ListByWorkspaceAsync`, `ListPagedAsync`, and `ListBySourceInvoiceAsync` (CreatedAt descending, then Id descending; filter by FinanceWorkspaceId and SourceInvoiceId; no Invoice join). Paged path: SQL filters FinanceWorkspaceId and optional Status, then a single materialization; `totalCount`, Order, Skip, and Take run in memory because the SQLite provider cannot ORDER BY DateTimeOffset (same trade-off as Invoice paged listing);
- Domain `Accrual` maps directly (no separate persistence entity);
- `DomainEvents` is not a persisted column;
- nullable `SourceInvoiceId` stores optional `InvoiceId` as `Guid?` with **no** FK to `Invoices` and **no** uniqueness constraint;
- lifecycle fields (`Status`, `RecognizedAt`, `ReversedAt`, `ReversalReason`, timestamps) round-trip faithfully through private-constructor materialization;
- migration `AddAccruals` creates table `Accruals` with workspace FK (`Restrict`) and `IX_Accruals_FinanceWorkspaceId`;
- search, filters, Invoice existence validation, concurrency tokens, ledger posting, and payments remain later slices.

## HTTP surface (F4I / F4K / F4L / F4Q / F4R)

Workspace-scoped Accrual HTTP API under `/api/finance-workspaces/{financeWorkspaceId}/accruals`:

| Method | Route | Application use case | Success |
|--------|-------|----------------------|---------|
| POST | `/` | Create accrual | 201 |
| GET | `/` | List accruals for workspace (newest first) | 200 |
| GET | `/paged?page={page}&pageSize={pageSize}&status={status?}` | List accruals for workspace (paged, newest first; optional status) | 200 |
| GET | `/by-invoice/{invoiceId}` | List accruals by source invoice id (newest first) | 200 |
| GET | `/{accrualId}` | Get by id | 200 |
| POST | `/{accrualId}/change-type` | Change type | 200 |
| POST | `/{accrualId}/change-amount` | Change amount | 200 |
| POST | `/{accrualId}/change-currency` | Change currency | 200 |
| POST | `/{accrualId}/change-recognition-date` | Change recognition date | 200 |
| POST | `/{accrualId}/change-description` | Change description | 200 |
| POST | `/{accrualId}/change-source-invoice` | Set or clear optional source invoice (`sourceInvoiceId` nullable) | 200 |
| POST | `/{accrualId}/recognize` | Recognize accrual | 200 |
| POST | `/{accrualId}/reverse` | Reverse accrual | 200 |

Status mapping via existing `ApplicationResultHttp`: ValidationFailed → 400, NotFound → 404 (missing or cross-workspace), Conflict → 409. Single-accrual responses use Application `AccrualDto`. List and list-by-invoice return a JSON array of `AccrualDto` (empty array when none; not 404). Paged list returns Application `PageResult<AccrualDto>` with `items`, `page`, `pageSize`, and `totalCount` (empty `items` when none; not 404). List, paged list, and list-by-invoice are read-only. Ordering: `CreatedAt` descending, then `AccrualId` descending. Paged list requires `page >= 1` and `1 <= pageSize <= 100` (same limits as Invoice F4N; omitted values bind as `0` and fail validation — no silent defaults); invalid paging is ValidationFailed. Optional paged query parameter `status` accepts exact Ordinal `Draft`, `Recognized`, or `Reversed` only; missing `status` means no status filter (F4Q all-status behavior); explicitly blank, whitespace, case variants, numeric values, or unknown names are ValidationFailed. Workspace and optional status filtering remain SQL predicates; `totalCount` is the full workspace-and-status-filtered count before paging; ordering and Skip/Take are in-memory because SQLite cannot ORDER BY DateTimeOffset (no schema/index/migration change in F4R). Paged list does not include source-invoice composition, CreatedAt range, or text filters. List-by-invoice filters by workspace and `SourceInvoiceId`; multiple accruals may share one source invoice; Invoice existence is not validated; there is no FK or uniqueness guarantee. Non-paged list and list-by-invoice do not include pagination or total-count metadata.

Deferred: CreatedAt range and text search/filters, Invoice existence validation, ledger posting from Recognize/Reverse, concurrency tokens, compensating accruals, authorization redesign, background recognition jobs.

## Notes on conventions adapted for F4F

- Timestamps use project names `CreatedAt`, `UpdatedAt`, `RecognizedAt`, `ReversedAt` (not `*Utc` suffixes).
- Event type names follow Invoice (`AccrualCreated`), not `*DomainEvent`.
- `UpdatedAt` is included because mutable Domain aggregates use it with monotonic timestamp checks.
- Description max length is **500**, matching invoice/journal/ledger line descriptions.
