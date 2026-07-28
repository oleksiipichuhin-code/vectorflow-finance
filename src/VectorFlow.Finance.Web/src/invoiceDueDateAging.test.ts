import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDayDiff,
  classifyDueDateAging,
  collectionsQueueDueToDateInput,
  dueDateCalendarString,
  localCalendarDateString,
  localCalendarYesterdayString,
  overdueQueueDueToDateInput
} from "./invoiceDueDateAging.ts";
import {
  buildInvoiceListQuery,
  dateInputToUtcEnd,
  resolveInvoiceFiltersForQuery
} from "./invoiceListQuery.ts";

describe("invoiceDueDateAging calendar helpers", () => {
  it("formats local calendar date from local getters", () => {
    const now = new Date(2026, 6, 27, 15, 30, 0); // local 27 Jul 2026
    assert.equal(localCalendarDateString(now), "2026-07-27");
  });

  it("yesterday crosses month boundary on local calendar", () => {
    const now = new Date(2026, 7, 1, 8, 0, 0); // 1 Aug local
    assert.equal(localCalendarYesterdayString(now), "2026-07-31");
  });

  it("reads intentional due day from UTC-midnight ISO", () => {
    assert.equal(dueDateCalendarString("2026-07-20T00:00:00.000Z"), "2026-07-20");
    assert.equal(dueDateCalendarString(null), null);
    assert.equal(dueDateCalendarString(""), null);
  });

  it("computes whole-day diffs via UTC midnights", () => {
    assert.equal(calendarDayDiff("2026-07-20", "2026-07-27"), 7);
    assert.equal(calendarDayDiff("2026-07-27", "2026-07-27"), 0);
    assert.equal(calendarDayDiff("2026-07-28", "2026-07-27"), -1);
  });
});

describe("classifyDueDateAging", () => {
  const now = new Date(2026, 6, 27, 18, 45, 0); // local afternoon — must not flip due-today

  it("classifies overdue when due day is before local today", () => {
    const aging = classifyDueDateAging("2026-07-20T00:00:00.000Z", now);
    assert.equal(aging.kind, "overdue");
    assert.equal(aging.label, "Прострочено");
    assert.equal(aging.dayOffset, 7);
    assert.match(aging.dayOffsetLabel, /7 днів прострочення/);
    assert.match(aging.explanation, /фактичну оплату в системі відсутні/);
    assert.equal(aging.explanation.includes("неоплат"), false);
    assert.equal(/оплачено|не оплачено/i.test(aging.explanation), false);
  });

  it("classifies due today on calendar match even late in the day", () => {
    const aging = classifyDueDateAging("2026-07-27T00:00:00.000Z", now);
    assert.equal(aging.kind, "due_today");
    assert.equal(aging.label, "Строк сьогодні");
    assert.equal(aging.dayOffset, 0);
  });

  it("does not mark due-today as overdue at 23:59 local", () => {
    const late = new Date(2026, 6, 27, 23, 59, 59);
    const aging = classifyDueDateAging("2026-07-27T00:00:00.000Z", late);
    assert.equal(aging.kind, "due_today");
  });

  it("classifies upcoming due dates as not due yet", () => {
    const aging = classifyDueDateAging("2026-08-01T00:00:00.000Z", now);
    assert.equal(aging.kind, "not_due_yet");
    assert.equal(aging.label, "Строк не настав");
    assert.equal(aging.dayOffset, 5);
    assert.match(aging.dayOffsetLabel, /через 5 днів/);
  });

  it("handles missing due date without inventing settlement", () => {
    const aging = classifyDueDateAging(null, now);
    assert.equal(aging.kind, "no_due_date");
    assert.equal(aging.label, "Немає строку");
    assert.equal(aging.dayOffset, null);
  });

  it("timezone boundary: local morning still uses local calendar today", () => {
    // Simulate a machine where local offset makes UTC still previous day.
    // We construct "now" with local components; due uses intentional UTC date label.
    const earlyLocal = new Date(2026, 6, 27, 0, 15, 0);
    assert.equal(localCalendarDateString(earlyLocal), "2026-07-27");
    const aging = classifyDueDateAging("2026-07-26T00:00:00.000Z", earlyLocal);
    assert.equal(aging.kind, "overdue");
    assert.equal(aging.dayOffset, 1);
  });
});

describe("payment collection queue dueTo mapping", () => {
  it("uses inclusive dueToUtc end of local today so overdue and due today are included", () => {
    const now = new Date(2026, 6, 27, 12, 0, 0);
    assert.equal(overdueQueueDueToDateInput(now), "2026-07-26");
    assert.equal(collectionsQueueDueToDateInput(now), "2026-07-27");

    const { query, validationError } = buildInvoiceListQuery(
      1,
      5,
      { status: "Issued", counterpartyReference: "acme" },
      "overdue",
      now
    );

    assert.equal(validationError, null);
    assert.equal(query.status, "Issued");
    assert.equal(query.counterpartyReference, "acme");
    assert.equal(query.dueToUtc, dateInputToUtcEnd("2026-07-27"));
    assert.equal(query.dueFromUtc, undefined);

    const yesterdayDue = Date.parse("2026-07-26T00:00:00.000Z");
    const todayDue = Date.parse("2026-07-27T00:00:00.000Z");
    const tomorrowDue = Date.parse("2026-07-28T00:00:00.000Z");
    const bound = Date.parse(query.dueToUtc!);
    assert.ok(yesterdayDue <= bound);
    assert.ok(todayDue <= bound);
    assert.ok(tomorrowDue > bound);
  });

  it("resolveInvoiceFiltersForQuery overrides stale dueTo while queue is active", () => {
    const now = new Date(2026, 6, 27, 9, 0, 0);
    const resolved = resolveInvoiceFiltersForQuery(
      {
        status: "Draft",
        dueToDate: "2026-01-01",
        dueFromDate: "2025-01-01"
      },
      "overdue",
      now
    );
    assert.equal(resolved.status, "Issued");
    assert.equal(resolved.dueToDate, "2026-07-27");
    assert.equal(resolved.dueFromDate, "2025-01-01");
  });

  it("leaves filters unchanged when queue is inactive", () => {
    const resolved = resolveInvoiceFiltersForQuery(
      { status: "Issued", dueToDate: "2026-08-15" },
      "",
      new Date(2026, 6, 27)
    );
    assert.equal(resolved.dueToDate, "2026-08-15");
    assert.equal(resolved.status, "Issued");
  });
});
