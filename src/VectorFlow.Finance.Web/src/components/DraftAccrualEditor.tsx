import { FormEvent, useState } from "react";
import {
  ACCRUAL_DESCRIPTION_MAX_LENGTH,
  ACCRUAL_TYPE_OPTIONS,
  type DraftAccrualEditorValues
} from "../draftAccrualEditor";
import { StatusMessage } from "./Panel";

type DraftAccrualEditorProps = {
  accrualDescription: string;
  initialValues: DraftAccrualEditorValues;
  busy: boolean;
  formError: string | null;
  onSave: (values: DraftAccrualEditorValues) => void;
  onCancel: () => void;
};

export function DraftAccrualEditor({
  accrualDescription,
  initialValues,
  busy,
  formError,
  onSave,
  onCancel
}: DraftAccrualEditorProps) {
  const [values, setValues] = useState<DraftAccrualEditorValues>(initialValues);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    onSave(values);
  }

  return (
    <form className="create-form create-form-accrual issue-prepare-form" onSubmit={handleSubmit}>
      <p className="meta">
        Редагування деталей: <span className="cell-wrap">{accrualDescription}</span>
      </p>
      <label>
        Тип
        <select
          value={values.type}
          onChange={(event) =>
            setValues((current) => ({ ...current, type: event.target.value }))
          }
          disabled={busy}
          aria-label="Тип нарахування"
        >
          {ACCRUAL_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
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
          {busy ? "Збереження…" : "Зберегти"}
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
