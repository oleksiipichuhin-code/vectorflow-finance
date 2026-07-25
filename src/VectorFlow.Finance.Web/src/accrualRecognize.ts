import type { Accrual } from "./api";

export function isDraftAccrual(accrual: Pick<Accrual, "status">): boolean {
  return accrual.status === "Draft";
}

export function canRecognizeAccrual(accrual: Pick<Accrual, "status">): boolean {
  return isDraftAccrual(accrual);
}
