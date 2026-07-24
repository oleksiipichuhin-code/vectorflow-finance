import { FormEvent } from "react";
import { Panel, StatusMessage } from "./components/Panel";
import { formatDate, formatMoney } from "./format";
import type { Accrual, FinanceWorkspace } from "./api";

type AccrualsViewProps = {
  workspace: FinanceWorkspace | null;
  accruals: Accrual[];
  accrualTotalCount: number;
  accrualsLoading: boolean;
  accrualsError: string | null;
  accrualType: string;
  accrualAmount: string;
  accrualCurrency: string;
  accrualRecognitionDate: string;
  accrualDescription: string;
  createAccrualBusy: boolean;
  createAccrualError: string | null;
  onTypeChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onRecognitionDateChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onRefresh: () => void;
  onCreateAccrual: (event: FormEvent<HTMLFormElement>) => void;
};

export function AccrualsView({
  workspace,
  accruals,
  accrualTotalCount,
  accrualsLoading,
  accrualsError,
  accrualType,
  accrualAmount,
  accrualCurrency,
  accrualRecognitionDate,
  accrualDescription,
  createAccrualBusy,
  createAccrualError,
  onTypeChange,
  onAmountChange,
  onCurrencyChange,
  onRecognitionDateChange,
  onDescriptionChange,
  onRefresh,
  onCreateAccrual
}: AccrualsViewProps) {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Accruals</h1>
        <p className="lede">Нарахування обраного фінансового простору з реального Finance API.</p>
      </header>

      <Panel
        title="Нарахування"
        headingId="accruals-heading"
        actions={
          <button type="button" onClick={onRefresh} disabled={!workspace || accrualsLoading}>
            Оновити
          </button>
        }
      >
        {!workspace ? (
          <StatusMessage>Спочатку завантажте Workspace.</StatusMessage>
        ) : (
          <>
            <p className="meta">
              Workspace: {workspace.name} · <span className="mono">{workspace.id}</span>
            </p>
            <form className="create-form create-form-accrual" onSubmit={onCreateAccrual}>
              <label>
                Тип
                <select value={accrualType} onChange={(event) => onTypeChange(event.target.value)}>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                </select>
              </label>
              <label>
                Сума
                <input
                  value={accrualAmount}
                  onChange={(event) => onAmountChange(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Валюта
                <input
                  value={accrualCurrency}
                  onChange={(event) => onCurrencyChange(event.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
              </label>
              <label>
                Дата визнання
                <input
                  type="date"
                  value={accrualRecognitionDate}
                  onChange={(event) => onRecognitionDateChange(event.target.value)}
                  required
                />
              </label>
              <label>
                Опис
                <input
                  value={accrualDescription}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={createAccrualBusy}>
                Створити чернетку
              </button>
            </form>
          </>
        )}

        {createAccrualError ? <StatusMessage tone="error">{createAccrualError}</StatusMessage> : null}
        {accrualsLoading ? <StatusMessage>Завантаження нарахувань…</StatusMessage> : null}
        {accrualsError ? <StatusMessage tone="error">{accrualsError}</StatusMessage> : null}
        {!accrualsLoading && !accrualsError && workspace && accruals.length === 0 ? (
          <StatusMessage>Нарахувань ще немає. Створіть чернетку або натисніть Оновити.</StatusMessage>
        ) : null}

        {accruals.length > 0 ? (
          <>
            <p className="meta">
              Показано {accruals.length} з {accrualTotalCount}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Статус</th>
                    <th>Опис</th>
                    <th>Сума</th>
                    <th>Дата визнання</th>
                    <th>Створено</th>
                  </tr>
                </thead>
                <tbody>
                  {accruals.map((accrual) => (
                    <tr key={accrual.id}>
                      <td>{accrual.type}</td>
                      <td>{accrual.status}</td>
                      <td>{accrual.description}</td>
                      <td>{formatMoney(accrual.amount, accrual.currency)}</td>
                      <td>{formatDate(accrual.recognitionDateUtc)}</td>
                      <td>{formatDate(accrual.createdAtUtc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Panel>
    </>
  );
}
