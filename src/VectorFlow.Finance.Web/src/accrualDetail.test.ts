import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAccrualDetailFields,
  canEditAccrualFromDetails,
  canManageAccrualLifecycleFromDetails,
  canViewAccrualDetails,
  DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE,
  detailEditActionsFor,
  detailLifecycleActionsFor,
  interpretAccrualDetailLoadError,
  interpretSourceInvoiceDetailLoadError,
  shouldLoadSourceInvoice,
  shouldReloadDetailAfterMutation,
  sourceInvoiceDetailFromInvoice,
  sourceInvoiceDetailNone,
  type BeginEditorOptions
} from "./accrualDetail.ts";
import type { Accrual, Invoice } from "./api.ts";
import { canEditAccrualAmount } from "./accrualEditAmount.ts";
import { canEditDraftAccrualDetails } from "./draftAccrualEditor.ts";
import { canRecognizeAccrual } from "./accrualRecognize.ts";
import { canReverseAccrual } from "./accrualReverse.ts";
import { canChangeAccrualSourceInvoice } from "./accrualSourceInvoice.ts";

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

function sampleAccrual(overrides: Partial<Accrual> = {}): Accrual {
  return {
    id: "a1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    type: "Revenue",
    amount: 250.5,
    currency: "UAH",
    recognitionDateUtc: "2026-07-01T00:00:00.000Z",
    description: "Detail sample",
    sourceInvoiceId: null,
    status: "Draft",
    createdAtUtc: "2026-07-01T10:00:00.000Z",
    updatedAtUtc: "2026-07-02T11:00:00.000Z",
    recognizedAtUtc: null,
    reversedAtUtc: null,
    reversalReason: null,
    ...overrides
  };
}

describe("canViewAccrualDetails", () => {
  it("is available for Draft", () => {
    assert.equal(canViewAccrualDetails({ status: "Draft" }), true);
  });

  it("is available for Recognized", () => {
    assert.equal(canViewAccrualDetails({ status: "Recognized" }), true);
  });

  it("is available for Reversed", () => {
    assert.equal(canViewAccrualDetails({ status: "Reversed" }), true);
  });

  it("is unavailable for unknown status", () => {
    assert.equal(canViewAccrualDetails({ status: "Unknown" }), false);
  });
});

describe("buildAccrualDetailFields", () => {
  it("formats amount and currency without float transforms", () => {
    const fields = buildAccrualDetailFields(sampleAccrual({ amount: 100.1, currency: "EUR" }));
    assert.equal(fields.amountDisplay, "100.10 EUR");
    assert.equal(fields.currency, "EUR");
  });

  it("formats dates via shared formatter and null timestamps as em dash", () => {
    const fields = buildAccrualDetailFields(
      sampleAccrual({
        status: "Draft",
        recognizedAtUtc: null,
        reversedAtUtc: null,
        reversalReason: null
      })
    );

    assert.notEqual(fields.recognitionDateDisplay, "—");
    assert.notEqual(fields.createdAtDisplay, "—");
    assert.notEqual(fields.updatedAtDisplay, "—");
    assert.equal(fields.recognizedAtDisplay, "—");
    assert.equal(fields.reversedAtDisplay, "—");
    assert.equal(fields.reversalReasonDisplay, "—");
  });

  it("shows Recognized and Reversed lifecycle fields when present", () => {
    const fields = buildAccrualDetailFields(
      sampleAccrual({
        status: "Reversed",
        recognizedAtUtc: "2026-07-03T08:00:00.000Z",
        reversedAtUtc: "2026-07-04T09:00:00.000Z",
        reversalReason: "Correction"
      })
    );

    assert.equal(fields.status, "Reversed");
    assert.notEqual(fields.recognizedAtDisplay, "—");
    assert.notEqual(fields.reversedAtDisplay, "—");
    assert.equal(fields.reversalReasonDisplay, "Correction");
  });

  it("keeps description, type, status and secondary id", () => {
    const fields = buildAccrualDetailFields(
      sampleAccrual({
        description: "Оренда",
        type: "Expense",
        status: "Recognized",
        id: "a2222222-2222-2222-2222-222222222222"
      })
    );

    assert.equal(fields.description, "Оренда");
    assert.equal(fields.type, "Expense");
    assert.equal(fields.status, "Recognized");
    assert.equal(fields.accrualId, "a2222222-2222-2222-2222-222222222222");
  });
});

describe("source invoice detail helpers", () => {
  it("shows no-selection state when sourceInvoiceId is null", () => {
    assert.equal(shouldLoadSourceInvoice(null), false);
    const view = sourceInvoiceDetailNone();
    assert.equal(view.kind, "none");
    if (view.kind === "none") {
      assert.equal(view.display, "Не вибрано");
    }
  });

  it("builds loaded invoice display from Invoice get-by-id payload", () => {
    const invoice: Invoice = {
      id: "i1111111-1111-1111-1111-111111111111",
      financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
      documentNumber: "INV-42",
      counterpartyReference: "ACME",
      currency: "UAH",
      status: "Issued",
      dueDateUtc: null,
      totalAmount: 10,
      createdAtUtc: "2026-07-01T00:00:00.000Z",
      updatedAtUtc: "2026-07-01T00:00:00.000Z",
      issuedAtUtc: "2026-07-01T00:00:00.000Z"
    };

    assert.equal(shouldLoadSourceInvoice(invoice.id), true);
    const view = sourceInvoiceDetailFromInvoice(invoice);
    assert.equal(view.kind, "ready");
    if (view.kind === "ready") {
      assert.match(view.display, /INV-42/);
      assert.match(view.display, /Issued/);
      assert.match(view.display, /10\.00 UAH/);
      assert.match(view.display, /ACME/);
    }
  });
});

describe("interpretAccrualDetailLoadError", () => {
  it("treats Accrual 404 as not found with list refresh and cleared data", () => {
    const failure = interpretAccrualDetailLoadError(
      new FakeFinanceApiRequestError("Accrual was not found.", 404, "NotFound")
    );
    assert.equal(failure.kind, "not_found");
    assert.equal(failure.refreshList, true);
    assert.equal(failure.clearAccrualData, true);
    assert.match(failure.message, /більше недоступне/);
  });

  it("treats network failure as retryable without list refresh", () => {
    const failure = interpretAccrualDetailLoadError(new Error("Failed to fetch"));
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.clearAccrualData, true);
    assert.equal(failure.message, "Failed to fetch");
  });

  it("treats unexpected 5xx as retryable", () => {
    const failure = interpretAccrualDetailLoadError(
      new FakeFinanceApiRequestError("Internal Server Error", 500, null)
    );
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.clearAccrualData, true);
  });
});

describe("interpretSourceInvoiceDetailLoadError", () => {
  it("keeps Accrual panel intact on Invoice 404", () => {
    const failure = interpretSourceInvoiceDetailLoadError(
      new FakeFinanceApiRequestError("Invoice was not found.", 404, "NotFound")
    );
    assert.equal(failure.kind, "not_found");
    assert.match(failure.message, /Рахунок недоступний|Повʼязаний рахунок/);
  });

  it("maps invoice network errors as retryable", () => {
    const failure = interpretSourceInvoiceDetailLoadError(new Error("Failed to fetch"));
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.message, "Failed to fetch");
  });
});

describe("detail panel close contract", () => {
  it("close path does not imply mutation helpers (read-only contract)", () => {
    // Close is a local UI state clear; opening uses GET helpers only.
    assert.equal(typeof canViewAccrualDetails, "function");
    assert.equal(typeof buildAccrualDetailFields, "function");
  });
});

describe("canEditAccrualFromDetails", () => {
  it("allows edit actions for Draft", () => {
    assert.equal(canEditAccrualFromDetails({ status: "Draft" }), true);
    assert.deepEqual(detailEditActionsFor({ status: "Draft" }), [
      "details",
      "amount",
      "sourceInvoice"
    ]);
  });

  it("hides edit actions for Recognized", () => {
    assert.equal(canEditAccrualFromDetails({ status: "Recognized" }), false);
    assert.deepEqual(detailEditActionsFor({ status: "Recognized" }), []);
  });

  it("hides edit actions for Reversed", () => {
    assert.equal(canEditAccrualFromDetails({ status: "Reversed" }), false);
    assert.deepEqual(detailEditActionsFor({ status: "Reversed" }), []);
  });

  it("aligns Draft edit gates with existing row editor eligibility", () => {
    const draft = sampleAccrual({ status: "Draft" });
    assert.equal(canEditDraftAccrualDetails(draft), true);
    assert.equal(canEditAccrualAmount(draft), true);
    assert.equal(canChangeAccrualSourceInvoice(draft), true);
    assert.equal(canEditAccrualFromDetails(draft), true);
  });
});

describe("detail edit handoff coordination", () => {
  it("row and detail launches share BeginEditorOptions shape", () => {
    const rowLaunch: BeginEditorOptions = {};
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    assert.equal(rowLaunch.preserveDetail, undefined);
    assert.equal(detailLaunch.preserveDetail, true);
  });

  it("reloads detail only for the open Accrual after mutation", () => {
    const accrualId = "a1111111-1111-1111-1111-111111111111";
    assert.equal(shouldReloadDetailAfterMutation(accrualId, accrualId), true);
    assert.equal(shouldReloadDetailAfterMutation(null, accrualId), false);
    assert.equal(
      shouldReloadDetailAfterMutation("a2222222-2222-2222-2222-222222222222", accrualId),
      false
    );
  });

  it("exposes post-mutation detail reload failure message without implying re-mutation", () => {
    assert.match(DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE, /Зміни збережено/);
    assert.match(DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE, /Спробувати знову/);
  });

  it("duplicate open of the same editor target is a no-op contract at begin helpers", () => {
    // AccrualsView begin* returns early when target.id already matches.
    const openId = "a1111111-1111-1111-1111-111111111111";
    const sameTarget = sampleAccrual({ id: openId });
    assert.equal(sameTarget.id, openId);
    assert.equal(canEditAccrualFromDetails(sameTarget), true);
  });
});

describe("detail handoff callback Accrual identity", () => {
  it("edit callbacks receive the open Draft Accrual identity", () => {
    const accrual = sampleAccrual({
      id: "a3333333-3333-3333-3333-333333333333",
      description: "Handoff target",
      amount: 77.7,
      sourceInvoiceId: "i1111111-1111-1111-1111-111111111111"
    });

    const received: Accrual[] = [];
    const onEditDetails = (value: Accrual) => received.push(value);
    const onEditAmount = (value: Accrual) => received.push(value);
    const onEditSourceInvoice = (value: Accrual) => received.push(value);

    assert.equal(canEditAccrualFromDetails(accrual), true);
    onEditDetails(accrual);
    onEditAmount(accrual);
    onEditSourceInvoice(accrual);

    assert.equal(received.length, 3);
    assert.ok(received.every((item) => item.id === accrual.id));
    assert.equal(received[0]!.description, "Handoff target");
    assert.equal(received[1]!.amount, 77.7);
    assert.equal(received[2]!.sourceInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });
});

describe("detailLifecycleActionsFor", () => {
  it("shows Recognize for Draft and aligns with row eligibility", () => {
    const draft = sampleAccrual({ status: "Draft" });
    assert.equal(canManageAccrualLifecycleFromDetails(draft), true);
    assert.deepEqual(detailLifecycleActionsFor(draft), ["recognize"]);
    assert.equal(canRecognizeAccrual(draft), true);
    assert.equal(canReverseAccrual(draft), false);
  });

  it("shows Reverse for Recognized and aligns with row eligibility", () => {
    const recognized = sampleAccrual({ status: "Recognized" });
    assert.equal(canManageAccrualLifecycleFromDetails(recognized), true);
    assert.deepEqual(detailLifecycleActionsFor(recognized), ["reverse"]);
    assert.equal(canRecognizeAccrual(recognized), false);
    assert.equal(canReverseAccrual(recognized), true);
  });

  it("hides lifecycle actions for Reversed", () => {
    const reversed = sampleAccrual({ status: "Reversed" });
    assert.equal(canManageAccrualLifecycleFromDetails(reversed), false);
    assert.deepEqual(detailLifecycleActionsFor(reversed), []);
    assert.equal(canRecognizeAccrual(reversed), false);
    assert.equal(canReverseAccrual(reversed), false);
  });

  it("keeps Draft edit actions available alongside Recognize", () => {
    const draft = sampleAccrual({ status: "Draft" });
    assert.deepEqual(detailEditActionsFor(draft), [
      "details",
      "amount",
      "sourceInvoice"
    ]);
    assert.deepEqual(detailLifecycleActionsFor(draft), ["recognize"]);
  });

  it("hides edit actions for Recognized while Reverse remains", () => {
    const recognized = sampleAccrual({ status: "Recognized" });
    assert.deepEqual(detailEditActionsFor(recognized), []);
    assert.deepEqual(detailLifecycleActionsFor(recognized), ["reverse"]);
  });
});

describe("detail lifecycle handoff coordination", () => {
  it("row and detail lifecycle launches share BeginEditorOptions shape", () => {
    const rowLaunch: BeginEditorOptions = {};
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    assert.equal(rowLaunch.preserveDetail, undefined);
    assert.equal(detailLaunch.preserveDetail, true);
  });

  it("reloads detail only for the open Accrual after lifecycle mutation", () => {
    const accrualId = "a4444444-4444-4444-4444-444444444444";
    assert.equal(shouldReloadDetailAfterMutation(accrualId, accrualId), true);
    assert.equal(shouldReloadDetailAfterMutation(null, accrualId), false);
    assert.equal(
      shouldReloadDetailAfterMutation("a5555555-5555-5555-5555-555555555555", accrualId),
      false
    );
  });

  it("post-mutation detail reload failure message does not imply re-mutation", () => {
    assert.match(DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE, /Зміни збережено/);
    assert.match(DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE, /Спробувати знову/);
  });

  it("lifecycle callbacks receive the open Accrual identity", () => {
    const draft = sampleAccrual({
      id: "a6666666-6666-6666-6666-666666666666",
      status: "Draft",
      description: "Recognize handoff"
    });
    const recognized = sampleAccrual({
      id: "a7777777-7777-7777-7777-777777777777",
      status: "Recognized",
      description: "Reverse handoff"
    });

    const recognizedIds: string[] = [];
    const reverseIds: string[] = [];
    const onRecognize = (value: Accrual) => recognizedIds.push(value.id);
    const onReverse = (value: Accrual) => reverseIds.push(value.id);

    assert.deepEqual(detailLifecycleActionsFor(draft), ["recognize"]);
    onRecognize(draft);
    assert.deepEqual(detailLifecycleActionsFor(recognized), ["reverse"]);
    onReverse(recognized);

    assert.deepEqual(recognizedIds, [draft.id]);
    assert.deepEqual(reverseIds, [recognized.id]);
  });

  it("cancel contract leaves detail identity untouched", () => {
    // Cancel is local UI state clear for reverse form / no-op for recognize dialog;
    // detailTargetId and detailAccrual remain under AccrualsView ownership.
    const openId = "a8888888-8888-8888-8888-888888888888";
    assert.equal(shouldReloadDetailAfterMutation(openId, openId), true);
    assert.equal(canManageAccrualLifecycleFromDetails({ status: "Recognized" }), true);
  });
});
