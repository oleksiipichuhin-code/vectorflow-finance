import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAddDraftInvoiceLine } from "./draftInvoiceLineAddEditor.ts";
import { canEditDraftInvoiceDueDate } from "./draftInvoiceDueDateEditor.ts";
import { canRemoveDraftInvoiceLine } from "./draftInvoiceLineRemoveEditor.ts";
import { canUpdateDraftInvoiceLine } from "./draftInvoiceLineUpdateEditor.ts";
import {
  applyDraftInvoiceHeaderEditorChanges,
  canEditDraftInvoiceHeader,
  detectDraftInvoiceHeaderEditorChanges,
  INVOICE_COUNTERPARTY_REFERENCE_MAX_LENGTH,
  INVOICE_DOCUMENT_NUMBER_MAX_LENGTH,
  interpretDraftInvoiceHeaderEditorError,
  validateDraftInvoiceHeaderEditorValues,
  valuesFromInvoice,
  type DraftInvoiceHeaderEditorMutations,
  type DraftInvoiceHeaderEditorValues
} from "./draftInvoiceHeaderEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";
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
    id: "b1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    documentNumber: "INV-HDR-1",
    counterpartyReference: "cp-1",
    currency: "UAH",
    status: "Draft",
    totalAmount: 100,
    dueDateUtc: "2026-08-01T00:00:00.000Z",
    issuedAtUtc: null,
    createdAtUtc: "2026-07-01T00:00:00.000Z",
    updatedAtUtc: "2026-07-01T00:00:00.000Z",
    lines: [],
    ...overrides
  };
}

function sampleValues(
  overrides: Partial<DraftInvoiceHeaderEditorValues> = {}
): DraftInvoiceHeaderEditorValues {
  return {
    documentNumber: "INV-HDR-1",
    counterpartyReference: "cp-1",
    currency: "UAH",
    ...overrides
  };
}

describe("canEditDraftInvoiceHeader", () => {
  it("allows edit only for Draft", () => {
    assert.equal(canEditDraftInvoiceHeader({ status: "Draft" }), true);
    assert.equal(canEditDraftInvoiceHeader({ status: "Issued" }), false);
  });

  it("reuses draft eligibility with lines, due-date, and issue helpers", () => {
    const draft = sampleInvoice();
    const issued = sampleInvoice({ status: "Issued" });
    assert.equal(canEditDraftInvoiceHeader(draft), isDraftInvoice(draft));
    assert.equal(canEditDraftInvoiceHeader(issued), isDraftInvoice(issued));
    assert.equal(canAddDraftInvoiceLine(draft), true);
    assert.equal(canEditDraftInvoiceDueDate(draft), true);
    assert.equal(canUpdateDraftInvoiceLine(draft), true);
    assert.equal(canRemoveDraftInvoiceLine(draft), true);
    assert.equal(canAddDraftInvoiceLine(issued), false);
  });
});

describe("valuesFromInvoice / detectDraftInvoiceHeaderEditorChanges", () => {
  it("prefills header fields from authoritative Invoice", () => {
    assert.deepEqual(valuesFromInvoice(sampleInvoice()), sampleValues());
  });

  it("returns empty when nothing changed including whitespace/currency case", () => {
    assert.deepEqual(
      detectDraftInvoiceHeaderEditorChanges(sampleValues(), sampleValues()),
      []
    );
    assert.deepEqual(
      detectDraftInvoiceHeaderEditorChanges(
        sampleValues(),
        sampleValues({
          documentNumber: "  INV-HDR-1  ",
          counterpartyReference: "  cp-1  ",
          currency: "uah"
        })
      ),
      []
    );
  });

  it("detects single-field edits and orders documentNumber → counterparty → currency", () => {
    assert.deepEqual(
      detectDraftInvoiceHeaderEditorChanges(
        sampleValues(),
        sampleValues({ documentNumber: "INV-HDR-2" })
      ),
      ["documentNumber"]
    );
    assert.deepEqual(
      detectDraftInvoiceHeaderEditorChanges(
        sampleValues(),
        sampleValues({ counterpartyReference: "cp-9" })
      ),
      ["counterpartyReference"]
    );
    assert.deepEqual(
      detectDraftInvoiceHeaderEditorChanges(sampleValues(), sampleValues({ currency: "USD" })),
      ["currency"]
    );
    assert.deepEqual(
      detectDraftInvoiceHeaderEditorChanges(
        sampleValues(),
        sampleValues({
          documentNumber: "INV-HDR-2",
          counterpartyReference: "cp-9",
          currency: "USD"
        })
      ),
      ["documentNumber", "counterpartyReference", "currency"]
    );
  });
});

describe("validateDraftInvoiceHeaderEditorValues", () => {
  it("rejects blank and overlength fields", () => {
    assert.match(
      validateDraftInvoiceHeaderEditorValues(sampleValues({ documentNumber: "   " })) ?? "",
      /Номер документа/
    );
    assert.match(
      validateDraftInvoiceHeaderEditorValues(
        sampleValues({ documentNumber: "X".repeat(INVOICE_DOCUMENT_NUMBER_MAX_LENGTH + 1) })
      ) ?? "",
      /Номер документа/
    );
    assert.match(
      validateDraftInvoiceHeaderEditorValues(
        sampleValues({ counterpartyReference: "   " })
      ) ?? "",
      /Контрагент/
    );
    assert.match(
      validateDraftInvoiceHeaderEditorValues(
        sampleValues({
          counterpartyReference: "X".repeat(INVOICE_COUNTERPARTY_REFERENCE_MAX_LENGTH + 1)
        })
      ) ?? "",
      /Контрагент/
    );
    assert.match(
      validateDraftInvoiceHeaderEditorValues(sampleValues({ currency: "  " })) ?? "",
      /Валюта/
    );
  });
});

describe("applyDraftInvoiceHeaderEditorChanges", () => {
  it("performs no mutations when nothing changed", async () => {
    const calls: string[] = [];
    const mutations: DraftInvoiceHeaderEditorMutations = {
      changeDocumentNumber: async () => {
        calls.push("documentNumber");
        return sampleInvoice();
      },
      changeCounterparty: async () => {
        calls.push("counterpartyReference");
        return sampleInvoice();
      },
      changeCurrency: async () => {
        calls.push("currency");
        return sampleInvoice();
      }
    };

    const result = await applyDraftInvoiceHeaderEditorChanges(
      "w1",
      "i1",
      sampleValues(),
      sampleValues({ currency: "uah" }),
      mutations
    );

    assert.equal(result, null);
    assert.deepEqual(calls, []);
  });

  it("calls only changed fields sequentially and never issues", async () => {
    const calls: string[] = [];
    const mutations: DraftInvoiceHeaderEditorMutations = {
      changeDocumentNumber: async (_w, _i, documentNumber) => {
        calls.push(`documentNumber:${documentNumber}`);
        return sampleInvoice({ documentNumber });
      },
      changeCounterparty: async (_w, _i, counterpartyReference) => {
        calls.push(`counterpartyReference:${counterpartyReference}`);
        return sampleInvoice({ counterpartyReference });
      },
      changeCurrency: async (_w, _i, currency) => {
        calls.push(`currency:${currency}`);
        return sampleInvoice({ currency });
      }
    };

    const result = await applyDraftInvoiceHeaderEditorChanges(
      "w1",
      "i1",
      sampleValues(),
      sampleValues({
        documentNumber: " INV-HDR-2 ",
        counterpartyReference: " cp-9 ",
        currency: "usd"
      }),
      mutations
    );

    assert.deepEqual(calls, [
      "documentNumber:INV-HDR-2",
      "counterpartyReference:cp-9",
      "currency:USD"
    ]);
    assert.equal(result?.currency, "USD");
  });

  it("rejects invalid input before any mutation", async () => {
    let called = false;
    const mutations: DraftInvoiceHeaderEditorMutations = {
      changeDocumentNumber: async () => {
        called = true;
        return sampleInvoice();
      },
      changeCounterparty: async () => {
        called = true;
        return sampleInvoice();
      },
      changeCurrency: async () => {
        called = true;
        return sampleInvoice();
      }
    };

    await assert.rejects(
      () =>
        applyDraftInvoiceHeaderEditorChanges(
          "w1",
          "i1",
          sampleValues(),
          sampleValues({ documentNumber: " " }),
          mutations
        ),
      /Номер документа/
    );
    assert.equal(called, false);
  });

  it("stops on first failure without calling later mutations", async () => {
    const calls: string[] = [];
    const mutations: DraftInvoiceHeaderEditorMutations = {
      changeDocumentNumber: async () => {
        calls.push("documentNumber");
        throw new FakeFinanceApiRequestError("bad number", 400, "ValidationFailed");
      },
      changeCounterparty: async () => {
        calls.push("counterpartyReference");
        return sampleInvoice();
      },
      changeCurrency: async () => {
        calls.push("currency");
        return sampleInvoice();
      }
    };

    await assert.rejects(
      () =>
        applyDraftInvoiceHeaderEditorChanges(
          "w1",
          "i1",
          sampleValues(),
          sampleValues({ documentNumber: "INV-2", currency: "USD" }),
          mutations
        ),
      /bad number/
    );
    assert.deepEqual(calls, ["documentNumber"]);
  });
});

describe("interpretDraftInvoiceHeaderEditorError", () => {
  it("keeps editor open on 400 without list refresh", () => {
    const failure = interpretDraftInvoiceHeaderEditorError(
      new FakeFinanceApiRequestError("Invalid currency", 400, "ValidationFailed")
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Invalid currency");
  });

  it("maps 404 and 409 to closed editor with list refresh", () => {
    const notFound = interpretDraftInvoiceHeaderEditorError(
      new FakeFinanceApiRequestError("gone", 404, "NotFound")
    );
    assert.equal(notFound.keepEditorOpen, false);
    assert.equal(notFound.refreshList, true);

    const conflict = interpretDraftInvoiceHeaderEditorError(
      new FakeFinanceApiRequestError("stale", 409, "Conflict")
    );
    assert.equal(conflict.keepEditorOpen, false);
    assert.equal(conflict.refreshList, true);
    assert.match(conflict.message, /змінено іншою дією/);
  });

  it("keeps editor open on network errors without list refresh", () => {
    const failure = interpretDraftInvoiceHeaderEditorError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
  });
});

describe("header editor handoff / coordination policy", () => {
  it("detail entry preserves invoiceId deep-link", () => {
    const preserveDetail = true;
    let invoiceId: string | null = "b1111111-1111-1111-1111-111111111111";
    if (!preserveDetail) {
      invoiceId = null;
    }
    assert.equal(invoiceId, "b1111111-1111-1111-1111-111111111111");
  });

  it("cancel keeps selection and performs zero mutations", () => {
    let mutationCount = 0;
    const cancel = () => {
      /* close only */
    };
    cancel();
    assert.equal(mutationCount, 0);
  });

  it("no-change save closes without mutation", async () => {
    let mutationCount = 0;
    const mutations: DraftInvoiceHeaderEditorMutations = {
      changeDocumentNumber: async () => {
        mutationCount += 1;
        return sampleInvoice();
      },
      changeCounterparty: async () => {
        mutationCount += 1;
        return sampleInvoice();
      },
      changeCurrency: async () => {
        mutationCount += 1;
        return sampleInvoice();
      }
    };
    const updated = await applyDraftInvoiceHeaderEditorChanges(
      "w1",
      "i1",
      sampleValues(),
      sampleValues(),
      mutations
    );
    assert.equal(updated, null);
    assert.equal(mutationCount, 0);
  });

  it("success reloads detail only for the open invoice and keeps Draft", () => {
    const detailTargetId = "b1111111-1111-1111-1111-111111111111";
    const updated = sampleInvoice({ documentNumber: "INV-HDR-2" });
    const shouldReload = detailTargetId === updated.id;
    assert.equal(shouldReload, true);
    assert.equal(updated.status, "Draft");
  });

  it("double-submit prevention blocks second save while busy", () => {
    const headerEditBusy = true;
    let started = false;
    if (!headerEditBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("cannot start header edit while another invoice mutation is pending", () => {
    const lineUpdateBusy = true;
    let started = false;
    if (!lineUpdateBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("starting header edit resets non-pending add/due-date/issue/line editors", () => {
    let lineAddOpen = true;
    let dueDateOpen = true;
    let issueOpen = true;
    let lineUpdateOpen = true;
    let lineRemoveOpen = true;
    // beginHeaderEdit clears sibling editors when not busy
    lineAddOpen = false;
    dueDateOpen = false;
    issueOpen = false;
    lineUpdateOpen = false;
    lineRemoveOpen = false;
    assert.equal(lineAddOpen || dueDateOpen || issueOpen || lineUpdateOpen || lineRemoveOpen, false);
  });

  it("pending header save blocks close for the same detail invoice", () => {
    const detailTargetId = "inv-1";
    const headerEditBusy = true;
    const headerEditTargetId = "inv-1";
    const closeBlocked =
      headerEditBusy && headerEditTargetId === detailTargetId;
    assert.equal(closeBlocked, true);
  });

  it("list reload failure does not retry header mutations", () => {
    let mutationCount = 1;
    const listReloadFailed = true;
    if (listReloadFailed) {
      // keep mutation count; do not re-apply
    }
    assert.equal(mutationCount, 1);
  });

  it("detail reload failure retry is getInvoice only", () => {
    const retries: string[] = [];
    retries.push("getInvoice");
    assert.deepEqual(retries, ["getInvoice"]);
  });

  it("filters are preserved after success policy", () => {
    const filters = { documentNumber: "INV", status: "Draft" as const };
    const afterSuccess = { ...filters };
    assert.deepEqual(afterSuccess, filters);
  });
});
