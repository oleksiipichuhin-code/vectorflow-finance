import { FormEvent, useState } from "react";
import {
  INVOICE_COUNTERPARTY_REFERENCE_MAX_LENGTH,
  INVOICE_DOCUMENT_NUMBER_MAX_LENGTH,
  type DraftInvoiceHeaderEditorValues
} from "../draftInvoiceHeaderEditor";
import { StatusMessage } from "./Panel";

type DraftInvoiceHeaderEditorProps = {
  documentNumberLabel: string;
  initialValues: DraftInvoiceHeaderEditorValues;
  busy: boolean;
  formError: string | null;
  onSave: (values: DraftInvoiceHeaderEditorValues) => void;
  onCancel: () => void;
};

export function DraftInvoiceHeaderEditor({
  documentNumberLabel,
  initialValues,
  busy,
  formError,
  onSave,
  onCancel
}: DraftInvoiceHeaderEditorProps) {
  const [values, setValues] = useState<DraftInvoiceHeaderEditorValues>(initialValues);

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
        Редагування реквізитів: <span className="mono">{documentNumberLabel}</span>
      </p>
      <label>
        Номер документа
        <input
          value={values.documentNumber}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              documentNumber: event.target.value
            }))
          }
          maxLength={INVOICE_DOCUMENT_NUMBER_MAX_LENGTH}
          required
          disabled={busy}
          aria-label="Номер документа рахунка"
        />
      </label>
      <label>
        Контрагент
        <input
          value={values.counterpartyReference}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              counterpartyReference: event.target.value
            }))
          }
          maxLength={INVOICE_COUNTERPARTY_REFERENCE_MAX_LENGTH}
          required
          disabled={busy}
          aria-label="Контрагент рахунка"
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
          aria-label="Валюта рахунка"
        />
      </label>
      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
      <div className="filter-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Збереження…" : "Зберегти реквізити"}
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
