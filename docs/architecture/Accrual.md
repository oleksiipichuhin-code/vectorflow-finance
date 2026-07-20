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
- draft mutations: type, amount, currency, recognition date, description, source invoice (set/clear via nullable id);
- recognize accrual (`Draft` → `Recognized`);
- reverse accrual (`Recognized` → `Reversed`).

`IAccrualRepository` is the Application persistence port (`GetByIdAsync` always workspace-scoped, `AddAsync`, `SaveChangesAsync`). Listing and get-by-invoice remain later slices.

Result mapping follows Invoice Application:

- `ApplicationResult<AccrualDto>`;
- `ArgumentException` → ValidationFailed;
- `InvalidOperationException` → Conflict;
- missing / cross-workspace aggregate → NotFound;
- missing finance workspace on create → NotFound.

Timestamps come from `IClock.UtcNow` inside handlers (commands do not carry mutation timestamps). Create generates `AccrualId` via `AccrualId.New()`.

Source invoice existence is **not** checked in Application (same posture as Domain). Persistence and HTTP remain later slices. Recognize/Reverse do not post to the ledger.

## Notes on conventions adapted for F4F

- Timestamps use project names `CreatedAt`, `UpdatedAt`, `RecognizedAt`, `ReversedAt` (not `*Utc` suffixes).
- Event type names follow Invoice (`AccrualCreated`), not `*DomainEvent`.
- `UpdatedAt` is included because mutable Domain aggregates use it with monotonic timestamp checks.
- Description max length is **500**, matching invoice/journal/ledger line descriptions.
