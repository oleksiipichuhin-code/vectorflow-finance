import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["finance", "common"]);
  const [values, setValues] = useState<DraftAccrualEditorValues>(initialValues);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    onSave(values);
  }

  function typeLabel(option: string): string {
    return option === "Revenue" || option === "Expense" ? t(`type.${option}`) : option;
  }

  return (
    <form className="create-form create-form-accrual issue-prepare-form" onSubmit={handleSubmit}>
      <p className="meta">
        {t("accruals.draftEditor.intro")}{" "}
        <span className="cell-wrap">{accrualDescription}</span>
      </p>
      <label>
        {t("accruals.field.type")}
        <select
          value={values.type}
          onChange={(event) =>
            setValues((current) => ({ ...current, type: event.target.value }))
          }
          disabled={busy}
          aria-label={t("accruals.draftEditor.typeAria")}
        >
          {ACCRUAL_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("accruals.field.currency")}
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
          aria-label={t("accruals.draftEditor.currencyAria")}
        />
      </label>
      <label>
        {t("accruals.field.recognitionDate")}
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
          aria-label={t("accruals.draftEditor.recognitionDateAria")}
        />
      </label>
      <label>
        {t("accruals.field.description")}
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
          aria-label={t("accruals.draftEditor.descriptionAria")}
        />
      </label>
      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
      <div className="filter-actions">
        <button type="submit" disabled={busy}>
          {busy ? t("saving", { ns: "common" }) : t("save", { ns: "common" })}
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
