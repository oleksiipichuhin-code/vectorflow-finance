import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canEditAccrualAmount } from "./accrualEditAmount.ts";
import { canRecognizeAccrual } from "./accrualRecognize.ts";
import { canReverseAccrual } from "./accrualReverse.ts";
import { canChangeAccrualSourceInvoice } from "./accrualSourceInvoice.ts";
import {
  applyDraftAccrualEditorChanges,
  canEditDraftAccrualDetails,
  detectDraftAccrualEditorChanges,
  formatRecognitionDateInput,
  interpretDraftAccrualEditorError,
  toRecognitionDateUtcIso,
  validateDraftAccrualEditorValues,
  valuesFromAccrual,
  type DraftAccrualEditorMutations,
  type DraftAccrualEditorValues
} from "./draftAccrualEditor.ts";
import type { Accrual } from "./api.ts";
import i18n from "./i18n/index.ts";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    amount: 100,
    currency: "UAH",
    recognitionDateUtc: "2026-07-01T00:00:00.000Z",
    description: "Baseline",
    sourceInvoiceId: null,
    status: "Draft",
    createdAtUtc: "2026-07-01T00:00:00.000Z",
    updatedAtUtc: "2026-07-01T00:00:00.000Z",
    recognizedAtUtc: null,
    reversedAtUtc: null,
    reversalReason: null,
    ...overrides
  };
}

function sampleValues(
  overrides: Partial<DraftAccrualEditorValues> = {}
): DraftAccrualEditorValues {
  return {
    description: "Baseline",
    recognitionDate: "2026-07-01",
    type: "Revenue",
    currency: "UAH",
    ...overrides
  };
}

describe("canEditDraftAccrualDetails", () => {
  it("allows edit only for Draft", () => {
    assert.equal(canEditDraftAccrualDetails({ status: "Draft" }), true);
    assert.equal(canEditDraftAccrualDetails({ status: "Recognized" }), false);
    assert.equal(canEditDraftAccrualDetails({ status: "Reversed" }), false);
  });

  it("keeps amount, source invoice, recognize, and reverse eligibility unchanged", () => {
    assert.equal(canEditAccrualAmount({ status: "Draft" }), true);
    assert.equal(canChangeAccrualSourceInvoice({ status: "Draft" }), true);
    assert.equal(canRecognizeAccrual({ status: "Draft" }), true);
    assert.equal(canReverseAccrual({ status: "Draft" }), false);
    assert.equal(canEditAccrualAmount({ status: "Recognized" }), false);
    assert.equal(canChangeAccrualSourceInvoice({ status: "Recognized" }), false);
    assert.equal(canRecognizeAccrual({ status: "Recognized" }), false);
    assert.equal(canReverseAccrual({ status: "Recognized" }), true);
  });
});

describe("recognition date helpers", () => {
  it("prefills YYYY-MM-DD from recognitionDateUtc", () => {
    assert.equal(formatRecognitionDateInput("2026-07-15T00:00:00.000Z"), "2026-07-15");
    assert.equal(
      valuesFromAccrual(sampleAccrual()).recognitionDate,
      "2026-07-01"
    );
  });

  it("converts date input to UTC midnight ISO", () => {
    assert.equal(toRecognitionDateUtcIso("2026-08-20"), "2026-08-20T00:00:00.000Z");
  });
});

describe("detectDraftAccrualEditorChanges", () => {
  it("returns empty when nothing changed", () => {
    assert.deepEqual(
      detectDraftAccrualEditorChanges(sampleValues(), sampleValues()),
      []
    );
    assert.deepEqual(
      detectDraftAccrualEditorChanges(
        sampleValues(),
        sampleValues({ description: "  Baseline  ", currency: "uah" })
      ),
      []
    );
  });

  it("detects single-field description, recognition date, type, and currency edits", () => {
    assert.deepEqual(
      detectDraftAccrualEditorChanges(
        sampleValues(),
        sampleValues({ description: "Updated" })
      ),
      ["description"]
    );
    assert.deepEqual(
      detectDraftAccrualEditorChanges(
        sampleValues(),
        sampleValues({ recognitionDate: "2026-08-01" })
      ),
      ["recognitionDate"]
    );
    assert.deepEqual(
      detectDraftAccrualEditorChanges(sampleValues(), sampleValues({ type: "Expense" })),
      ["type"]
    );
    assert.deepEqual(
      detectDraftAccrualEditorChanges(sampleValues(), sampleValues({ currency: "USD" })),
      ["currency"]
    );
  });

  it("orders multiple changed fields as description → date → type → currency", () => {
    assert.deepEqual(
      detectDraftAccrualEditorChanges(
        sampleValues(),
        sampleValues({
          description: "Updated",
          recognitionDate: "2026-08-01",
          type: "Expense",
          currency: "USD"
        })
      ),
      ["description", "recognitionDate", "type", "currency"]
    );
    assert.deepEqual(
      detectDraftAccrualEditorChanges(
        sampleValues(),
        sampleValues({ description: "Updated", recognitionDate: "2026-08-01" })
      ),
      ["description", "recognitionDate"]
    );
  });
});

describe("validateDraftAccrualEditorValues", () => {
  it("rejects blank description, currency, invalid type, and bad date", () => {
    assert.equal(
      validateDraftAccrualEditorValues(sampleValues({ description: "   " })),
      i18n.t("accruals.error.descriptionRequired", { ns: "finance" })
    );
    assert.equal(
      validateDraftAccrualEditorValues(sampleValues({ currency: "  " })),
      i18n.t("accruals.error.currencyRequired", { ns: "finance" })
    );
    assert.equal(
      validateDraftAccrualEditorValues(sampleValues({ type: "Payroll" })),
      i18n.t("accruals.error.typeInvalid", { ns: "finance" })
    );
    assert.equal(
      validateDraftAccrualEditorValues(sampleValues({ recognitionDate: "bad" })),
      i18n.t("accruals.error.recognitionDateFormat", { ns: "finance" })
    );
  });
});

describe("applyDraftAccrualEditorChanges", () => {
  it("issues no mutations when values are unchanged", async () => {
    const calls: string[] = [];
    const mutations: DraftAccrualEditorMutations = {
      changeDescription: async () => {
        calls.push("description");
        return sampleAccrual();
      },
      changeRecognitionDate: async () => {
        calls.push("recognitionDate");
        return sampleAccrual();
      },
      changeType: async () => {
        calls.push("type");
        return sampleAccrual();
      },
      changeCurrency: async () => {
        calls.push("currency");
        return sampleAccrual();
      }
    };

    const result = await applyDraftAccrualEditorChanges(
      "w1",
      "a1",
      sampleValues(),
      sampleValues({ description: " Baseline ", currency: "uah" }),
      mutations
    );

    assert.equal(result, null);
    assert.deepEqual(calls, []);
  });

  it("calls only change-description for a description-only edit", async () => {
    const calls: string[] = [];
    const mutations: DraftAccrualEditorMutations = {
      changeDescription: async (_w, _a, description) => {
        calls.push(`description:${description}`);
        return sampleAccrual({ description });
      },
      changeRecognitionDate: async () => {
        calls.push("recognitionDate");
        return sampleAccrual();
      },
      changeType: async () => {
        calls.push("type");
        return sampleAccrual();
      },
      changeCurrency: async () => {
        calls.push("currency");
        return sampleAccrual();
      }
    };

    const result = await applyDraftAccrualEditorChanges(
      "w1",
      "a1",
      sampleValues(),
      sampleValues({ description: "  New desc  " }),
      mutations
    );

    assert.equal(result?.description, "New desc");
    assert.deepEqual(calls, ["description:New desc"]);
  });

  it("calls only change-currency for a currency-only edit", async () => {
    const calls: string[] = [];
    const mutations: DraftAccrualEditorMutations = {
      changeDescription: async () => {
        calls.push("description");
        return sampleAccrual();
      },
      changeRecognitionDate: async () => {
        calls.push("recognitionDate");
        return sampleAccrual();
      },
      changeType: async () => {
        calls.push("type");
        return sampleAccrual();
      },
      changeCurrency: async (_w, _a, currency) => {
        calls.push(`currency:${currency}`);
        return sampleAccrual({ currency });
      }
    };

    await applyDraftAccrualEditorChanges(
      "w1",
      "a1",
      sampleValues(),
      sampleValues({ currency: "usd" }),
      mutations
    );

    assert.deepEqual(calls, ["currency:USD"]);
  });

  it("calls recognition-date and type editors independently", async () => {
    const dateCalls: string[] = [];
    const typeCalls: string[] = [];

    await applyDraftAccrualEditorChanges(
      "w1",
      "a1",
      sampleValues(),
      sampleValues({ recognitionDate: "2026-09-01" }),
      {
        changeDescription: async () => sampleAccrual(),
        changeRecognitionDate: async (_w, _a, recognitionDateUtc) => {
          dateCalls.push(recognitionDateUtc);
          return sampleAccrual({ recognitionDateUtc });
        },
        changeType: async () => sampleAccrual(),
        changeCurrency: async () => sampleAccrual()
      }
    );

    await applyDraftAccrualEditorChanges(
      "w1",
      "a1",
      sampleValues(),
      sampleValues({ type: "Expense" }),
      {
        changeDescription: async () => sampleAccrual(),
        changeRecognitionDate: async () => sampleAccrual(),
        changeType: async (_w, _a, type) => {
          typeCalls.push(type);
          return sampleAccrual({ type });
        },
        changeCurrency: async () => sampleAccrual()
      }
    );

    assert.deepEqual(dateCalls, ["2026-09-01T00:00:00.000Z"]);
    assert.deepEqual(typeCalls, ["Expense"]);
  });

  it("applies multiple fields sequentially and stops on first failure without later calls", async () => {
    const calls: string[] = [];
    const mutations: DraftAccrualEditorMutations = {
      changeDescription: async () => {
        calls.push("description");
        return sampleAccrual({ description: "Updated" });
      },
      changeRecognitionDate: async () => {
        calls.push("recognitionDate");
        throw new FakeFinanceApiRequestError(
          "Accrual description must not be blank.",
          400,
          "ValidationFailed"
        );
      },
      changeType: async () => {
        calls.push("type");
        return sampleAccrual();
      },
      changeCurrency: async () => {
        calls.push("currency");
        return sampleAccrual();
      }
    };

    await assert.rejects(
      () =>
        applyDraftAccrualEditorChanges(
          "w1",
          "a1",
          sampleValues(),
          sampleValues({
            description: "Updated",
            recognitionDate: "2026-08-01",
            type: "Expense",
            currency: "USD"
          }),
          mutations
        ),
      (error: unknown) => {
        assert.ok(error instanceof FakeFinanceApiRequestError);
        assert.equal(error.status, 400);
        return true;
      }
    );

    assert.deepEqual(calls, ["description", "recognitionDate"]);
  });

  it("rejects client validation before any mutation", async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        applyDraftAccrualEditorChanges(
          "w1",
          "a1",
          sampleValues(),
          sampleValues({ description: "   " }),
          {
            changeDescription: async () => {
              calls.push("description");
              return sampleAccrual();
            },
            changeRecognitionDate: async () => sampleAccrual(),
            changeType: async () => sampleAccrual(),
            changeCurrency: async () => sampleAccrual()
          }
        ),
      new RegExp(escapeRegExp(i18n.t("accruals.error.descriptionRequired", { ns: "finance" })))
    );
    assert.deepEqual(calls, []);
  });
});

describe("interpretDraftAccrualEditorError", () => {
  it("keeps editor open for 400 validation failures", () => {
    const failure = interpretDraftAccrualEditorError(
      new FakeFinanceApiRequestError(
        "Accrual description must not be blank.",
        400,
        "ValidationFailed"
      )
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.match(failure.message, /must not be blank/);
  });

  it("maps 404 to closed editor and refresh", () => {
    const failure = interpretDraftAccrualEditorError(
      new FakeFinanceApiRequestError("Accrual was not found.", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.equal(
      failure.message,
      i18n.t("accruals.error.notFoundRefreshed", { ns: "finance" })
    );
  });

  it("maps 409 conflict to closed editor, refresh, and no auto-retry guidance", () => {
    const failure = interpretDraftAccrualEditorError(
      new FakeFinanceApiRequestError(
        "The accrual was modified by another request. Reload and retry.",
        409,
        "Conflict"
      )
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.equal(failure.message, i18n.t("accruals.error.editorConflict", { ns: "finance" }));
  });

  it("keeps editor open for network-style errors without refresh", () => {
    const failure = interpretDraftAccrualEditorError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });
});
