import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_LEDGER_POSTED_PERIOD,
  filterLedgerPostings,
  hasActiveLedgerPostedPeriod,
  parseSourceJournalEntryIdFilter,
  validateLedgerPostedPeriodRange
} from "./ledgerPostings.ts";
import type { LedgerPosting } from "./api.ts";

function samplePosting(
  overrides: Partial<LedgerPosting> & Pick<LedgerPosting, "id" | "journalEntryId" | "postedAtUtc">
): LedgerPosting {
  return {
    financeWorkspaceId: "11111111-1111-1111-1111-111111111111",
    totalDebit: 100,
    totalCredit: 100,
    lines: [],
    ...overrides
  };
}

describe("ledgerPostings filters", () => {
  const a = samplePosting({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    journalEntryId: "11111111-1111-1111-1111-111111111111",
    postedAtUtc: "2026-07-10T12:00:00.000Z"
  });
  const b = samplePosting({
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    journalEntryId: "22222222-2222-2222-2222-222222222222",
    postedAtUtc: "2026-07-20T12:00:00.000Z"
  });

  it("returns all when filters empty", () => {
    const { items, validationError } = filterLedgerPostings(
      [a, b],
      EMPTY_LEDGER_POSTED_PERIOD,
      ""
    );
    assert.equal(validationError, null);
    assert.equal(items.length, 2);
    assert.equal(hasActiveLedgerPostedPeriod(EMPTY_LEDGER_POSTED_PERIOD), false);
  });

  it("filters by inclusive posted date range", () => {
    const { items, validationError } = filterLedgerPostings(
      [a, b],
      { postedFromDate: "2026-07-15", postedToDate: "2026-07-31" },
      ""
    );
    assert.equal(validationError, null);
    assert.deepEqual(
      items.map((row) => row.id),
      [b.id]
    );
    assert.equal(
      hasActiveLedgerPostedPeriod({
        postedFromDate: "2026-07-15",
        postedToDate: "2026-07-31"
      }),
      true
    );
  });

  it("filters by exact source journal entry id", () => {
    const { items, validationError } = filterLedgerPostings(
      [a, b],
      EMPTY_LEDGER_POSTED_PERIOD,
      "11111111-1111-1111-1111-111111111111"
    );
    assert.equal(validationError, null);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.id, a.id);
  });

  it("rejects inverted posted range", () => {
    assert.equal(
      validateLedgerPostedPeriodRange("2026-08-01", "2026-07-01"),
      "Дата «з» не може бути пізніше за дату «по»."
    );
    const { items, validationError } = filterLedgerPostings(
      [a, b],
      { postedFromDate: "2026-08-01", postedToDate: "2026-07-01" },
      ""
    );
    assert.equal(validationError, "Дата «з» не може бути пізніше за дату «по».");
    assert.deepEqual(items, []);
  });

  it("parses only valid GUID source journal filters", () => {
    assert.equal(parseSourceJournalEntryIdFilter("not-a-guid"), "");
    assert.equal(
      parseSourceJournalEntryIdFilter("11111111-1111-1111-1111-111111111111"),
      "11111111-1111-1111-1111-111111111111"
    );
  });
});
