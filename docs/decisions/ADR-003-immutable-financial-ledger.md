# ADR-003 — Immutable Financial Ledger

## Status

Accepted

## Context

Financial history must remain trustworthy after posting. Silent edits to posted ledger records undermine auditability, reconciliation, and dispute resolution.

## Decision

Financial records that have been posted will eventually be immutable. Corrections will use reversal or correction entries rather than in-place mutation of posted history.

Supporting principles:

- money uses decimal plus currency;
- floating-point types are prohibited for financial values;
- invoices and payments remain distinct concepts;
- partial payments and allocations must be supported later.

Ledger posting logic is not implemented in F0. This ADR establishes the permanence rule before operational ledger code is introduced.

## Consequences

Positive:

- clear audit trail;
- safer reconciliation and dispute handling;
- predictable correction workflows.

Trade-offs:

- correction UX is more complex than editable balances;
- reporting must understand reversals and correction entries.
