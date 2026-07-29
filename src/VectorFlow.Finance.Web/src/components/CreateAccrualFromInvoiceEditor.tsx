import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ACCRUAL_DESCRIPTION_MAX_LENGTH,
  ACCRUAL_TYPE_OPTIONS,
  type CreateAccrualFromInvoiceValues
} from "../invoiceAccrualBridge";
import { StatusMessage } from "./Panel";

type CreateAccrualFromInvoiceEditorProps = {
  documentNumberLabel: string;
  initialValues: CreateAccrualFromInvoiceValues;
  busy: boolean;
  formError: string | null;
  onSave: (values: CreateAccrualFromInvoiceValues) => void;
  onCancel: () => void;
};

export function CreateAccrualFromInvoiceEditor({
  documentNumberLabel,
  initialValues,
  busy,
  formError,
  onSave,
  onCancel
}: CreateAccrualFromInvoiceEditorProps) {
  const { t } = useTranslation(["finance", "common"]);
  const [values, setValues] = useState<CreateAccrualFromInvoiceValues>(initialValues);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    onSave(values);
  }

  function typeLabel(option: string): string {
    const key = `type.${option}`;
    const translated = t(key);
    return translated === key ? option : translated;
  }

  return (
    <form className="create-form issue-prepare-form" onSubmit={handleSubmit}>
      <p className="meta">
        {t("createAccrualFromInvoice.intro")}{" "}
        <span className="mono">{documentNumberLabel}</span>
      </p>
      <p className="meta">{t("createAccrualFromInvoice.sourceLocked")}</p>
      <label>
        {t("createAccrualFromInvoice.type")}
        <select
          value={values.type}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              type: event.target.value as CreateAccrualFromInvoiceValues["type"]
            }))
          }
          disabled={busy}
          aria-label={t("createAccrualFromInvoice.typeAria")}
        >
          {ACCRUAL_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {typeLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("createAccrualFromInvoice.amount")}
        <input
          value={values.amount}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              amount: event.target.value
            }))
          }
          inputMode="decimal"
          required
          disabled={busy}
          aria-label={t("createAccrualFromInvoice.amountAria")}
        />
      </label>
      <label>
        {t("createAccrualFromInvoice.currency")}
        <input
          value={values.currency}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              currency: event.target.value.toUpperCase()
            }))
          }
          maxLength={3}
          required
          disabled={busy}
          aria-label={t("createAccrualFromInvoice.currencyAria")}
        />
      </label>
      <label>
        {t("createAccrualFromInvoice.recognitionDate")}
        <input
          type="date"
          value={values.recognitionDate}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              recognitionDate: event.target.value
            }))
          }
          required
          disabled={busy}
          aria-label={t("createAccrualFromInvoice.recognitionDateAria")}
        />
      </label>
      <label>
        {t("createAccrualFromInvoice.description")}
        <input
          value={values.description}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value
            }))
          }
          maxLength={ACCRUAL_DESCRIPTION_MAX_LENGTH}
          required
          disabled={busy}
          aria-label={t("createAccrualFromInvoice.descriptionAria")}
        />
      </label>
      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
      <div className="filter-actions">
        <button type="submit" disabled={busy}>
          {busy
            ? t("createAccrualFromInvoice.creating")
            : t("createAccrualFromInvoice.submit")}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          {t("cancel", { ns: "common" })}
        </button>
      </div>
    </form>
  );
}
