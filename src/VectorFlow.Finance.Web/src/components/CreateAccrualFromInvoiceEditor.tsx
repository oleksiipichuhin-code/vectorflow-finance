import { FormEvent, useState } from "react";
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
  const [values, setValues] = useState<CreateAccrualFromInvoiceValues>(initialValues);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    onSave(values);
  }

  return (
    <form className="create-form issue-prepare-form" onSubmit={handleSubmit}>
      <p className="meta">
        Створення нарахування з рахунка:{" "}
        <span className="mono">{documentNumberLabel}</span>
      </p>
      <p className="meta">
        Рахунок-джерело зафіксовано для цієї дії і передається в create Accrual.
      </p>
      <label>
        Тип
        <select
          value={values.type}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              type: event.target.value as CreateAccrualFromInvoiceValues["type"]
            }))
          }
          disabled={busy}
          aria-label="Тип нарахування"
        >
          {ACCRUAL_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        Сума
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
          aria-label="Сума нарахування"
        />
      </label>
      <label>
        Валюта
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
          aria-label="Валюта нарахування"
        />
      </label>
      <label>
        Дата визнання
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
          aria-label="Дата визнання нарахування"
        />
      </label>
      <label>
        Опис
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
          aria-label="Опис нарахування"
        />
      </label>
      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
      <div className="filter-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Створення…" : "Створити нарахування"}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Скасувати
        </button>
      </div>
    </form>
  );
}
