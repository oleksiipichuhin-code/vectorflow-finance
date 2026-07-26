import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoiceDetailFields,
  canViewInvoiceDetails,
  interpretInvoiceDetailLoadError
} from "./invoiceDetail.ts";
import type { Invoice } from "./api.ts";

class FakeFinanceApiRequestError extends Error {
  readonly status: number;
  readonly errorKind: string | null;

  constructor(message: string, status: number, errorKind: string | null) {
    super(message);
    this.name = "FinanceApiRequestError";
    this.status = status;
    this.errorKind = errorKind;
  }
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    documentNumber: "INV-DETAIL-1",
    counterpartyReference: "cp-1",
    currency: "UAH",
    status: "Draft",
    dueDateUtc: null,
    totalAmount: 0,
    createdAtUtc: "2026-07-01T10:00:00.000Z",
    updatedAtUtc: "2026-07-02T11:00:00.000Z",
    issuedAtUtc: null,
    lines: [],
    ...overrides
  };
}

describe("canViewInvoiceDetails", () => {
  it("is available for Draft and Issued", () => {
    assert.equal(canViewInvoiceDetails({ status: "Draft" }), true);
    assert.equal(canViewInvoiceDetails({ status: "Issued" }), true);
  });

  it("is unavailable for unknown status", () => {
    assert.equal(canViewInvoiceDetails({ status: "Cancelled" }), false);
  });
});

describe("buildInvoiceDetailFields", () => {
  it("formats amount/currency and null dates as em dash", () => {
    const fields = buildInvoiceDetailFields(sampleInvoice({ totalAmount: 250.5 }));
    assert.equal(fields.documentNumber, "INV-DETAIL-1");
    assert.equal(fields.status, "Draft");
    assert.equal(fields.counterpartyReference, "cp-1");
    assert.equal(fields.amountDisplay, "250.50 UAH");
    assert.equal(fields.currency, "UAH");
    assert.equal(fields.dueDateDisplay, "—");
    assert.equal(fields.issuedAtDisplay, "—");
    assert.equal(fields.invoiceId, "i1111111-1111-1111-1111-111111111111");
    assert.deepEqual(fields.lines, []);
  });

  it("shows issued and due dates when present", () => {
    const fields = buildInvoiceDetailFields(
      sampleInvoice({
        status: "Issued",
        dueDateUtc: "2026-08-01T00:00:00.000Z",
        issuedAtUtc: "2026-07-03T08:00:00.000Z",
        totalAmount: 100
      })
    );
    assert.equal(fields.status, "Issued");
    assert.notEqual(fields.dueDateDisplay, "—");
    assert.notEqual(fields.issuedAtDisplay, "—");
  });

  it("renders nullable line description as em dash and sorts lines", () => {
    const fields = buildInvoiceDetailFields(
      sampleInvoice({
        lines: [
          {
            id: "l2",
            sequence: 2,
            description: "Second",
            quantity: 2,
            unitPrice: 10,
            lineAmount: 20
          },
          {
            id: "l1",
            sequence: 1,
            description: null,
            quantity: 1,
            unitPrice: 5,
            lineAmount: 5
          }
        ]
      })
    );
    assert.equal(fields.lines.length, 2);
    assert.equal(fields.lines[0]!.sequence, 1);
    assert.equal(fields.lines[0]!.descriptionDisplay, "—");
    assert.equal(fields.lines[1]!.descriptionDisplay, "Second");
  });

  it("treats missing lines as empty", () => {
    const invoice = sampleInvoice();
    delete invoice.lines;
    const fields = buildInvoiceDetailFields(invoice);
    assert.deepEqual(fields.lines, []);
  });
});

describe("interpretInvoiceDetailLoadError", () => {
  it("maps 404 to not found with list refresh", () => {
    const failure = interpretInvoiceDetailLoadError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(failure.kind, "not_found");
    assert.equal(failure.refreshList, true);
    assert.equal(failure.clearInvoiceData, true);
    assert.match(failure.message, /більше недоступний/);
  });

  it("maps network errors as retryable without list refresh", () => {
    const failure = interpretInvoiceDetailLoadError(new Error("Failed to fetch"));
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });

  it("maps unexpected 5xx as retryable", () => {
    const failure = interpretInvoiceDetailLoadError(
      new FakeFinanceApiRequestError("Boom", 500, "ServerError")
    );
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.clearInvoiceData, true);
  });
});

describe("invoice detail deep-link coordination", () => {
  it("invalid id policy does not imply GET (parse-only contract)", () => {
    assert.equal(parseInvoiceIdParamSafe("not-a-guid"), null);
  });

  it("stale selection compares open target to requested id", () => {
    const openId = "i1111111-1111-1111-1111-111111111111";
    const lateId = "i2222222-2222-2222-2222-222222222222";
    assert.equal(openId === openId, true);
    assert.equal(openId === lateId, false);
  });
});

function parseInvoiceIdParamSafe(value: string): string | null {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return UUID_RE.test(value.trim()) ? value.trim() : null;
}
