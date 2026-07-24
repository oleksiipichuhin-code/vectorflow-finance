import { FormEvent } from "react";
import { Panel, StatusMessage } from "./components/Panel";
import { formatDate, formatMoney } from "./format";
import type { FinanceWorkspace, Invoice } from "./api";

type InvoicesViewProps = {
  workspace: FinanceWorkspace | null;
  invoices: Invoice[];
  invoiceTotalCount: number;
  invoicesLoading: boolean;
  invoicesError: string | null;
  documentNumber: string;
  counterpartyReference: string;
  currency: string;
  createInvoiceBusy: boolean;
  createInvoiceError: string | null;
  onDocumentNumberChange: (value: string) => void;
  onCounterpartyChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onRefresh: () => void;
  onCreateInvoice: (event: FormEvent<HTMLFormElement>) => void;
};

export function InvoicesView({
  workspace,
  invoices,
  invoiceTotalCount,
  invoicesLoading,
  invoicesError,
  documentNumber,
  counterpartyReference,
  currency,
  createInvoiceBusy,
  createInvoiceError,
  onDocumentNumberChange,
  onCounterpartyChange,
  onCurrencyChange,
  onRefresh,
  onCreateInvoice
}: InvoicesViewProps) {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Invoices</h1>
        <p className="lede">Рахунки обраного фінансового простору з реального Finance API.</p>
      </header>

      <Panel
        title="Рахунки"
        headingId="invoices-heading"
        actions={
          <button type="button" onClick={onRefresh} disabled={!workspace || invoicesLoading}>
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
            <form className="create-form" onSubmit={onCreateInvoice}>
              <label>
                Номер документа
                <input
                  value={documentNumber}
                  onChange={(event) => onDocumentNumberChange(event.target.value)}
                  placeholder="INV-20260724-001"
                  required
                />
              </label>
              <label>
                Контрагент
                <input
                  value={counterpartyReference}
                  onChange={(event) => onCounterpartyChange(event.target.value)}
                  required
                />
              </label>
              <label>
                Валюта
                <input
                  value={currency}
                  onChange={(event) => onCurrencyChange(event.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
              </label>
              <button type="submit" disabled={createInvoiceBusy}>
                Створити чернетку
              </button>
            </form>
          </>
        )}

        {createInvoiceError ? <StatusMessage tone="error">{createInvoiceError}</StatusMessage> : null}
        {invoicesLoading ? <StatusMessage>Завантаження рахунків…</StatusMessage> : null}
        {invoicesError ? <StatusMessage tone="error">{invoicesError}</StatusMessage> : null}
        {!invoicesLoading && !invoicesError && workspace && invoices.length === 0 ? (
          <StatusMessage>Рахунків ще немає. Створіть чернетку через форму вище.</StatusMessage>
        ) : null}

        {invoices.length > 0 ? (
          <>
            <p className="meta">
              Показано {invoices.length} з {invoiceTotalCount}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Статус</th>
                    <th>Контрагент</th>
                    <th>Сума</th>
                    <th>Створено</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.documentNumber}</td>
                      <td>{invoice.status}</td>
                      <td>{invoice.counterpartyReference}</td>
                      <td>{formatMoney(invoice.totalAmount, invoice.currency)}</td>
                      <td>{formatDate(invoice.createdAtUtc)}</td>
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
