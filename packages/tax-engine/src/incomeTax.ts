import {
  INCOME_TAX_BRACKETS,
  INCOME_TAX_VERIFIED_THROUGH,
  LOCAL_INCOME_TAX_RATE,
} from "./rates.ts";

export interface IncomeTaxResult {
  taxableIncome: number;
  marginalRate: number;
  incomeTax: number; // 산출세액 (원 미만 절사)
  localIncomeTax: number;
  total: number;
  warnings: string[];
}

/** 과세표준 → 종합소득세 산출세액 (세액공제·감면 전) */
export function calcIncomeTax(taxableIncome: number, taxYear?: number): IncomeTaxResult {
  if (!Number.isFinite(taxableIncome) || taxableIncome < 0) {
    throw new RangeError("과세표준은 0 이상의 숫자여야 합니다");
  }
  const base = Math.floor(taxableIncome);
  const bracket = INCOME_TAX_BRACKETS.find((b) => base <= b.upTo)!;
  const incomeTax = Math.max(0, Math.floor(base * bracket.rate - bracket.deduction));
  const localIncomeTax = Math.floor(incomeTax * LOCAL_INCOME_TAX_RATE);
  const warnings: string[] = [];
  if (taxYear && taxYear > INCOME_TAX_VERIFIED_THROUGH) {
    warnings.push(`${taxYear} 귀속 세율표는 미검증 — ${INCOME_TAX_VERIFIED_THROUGH} 귀속 세율로 계산함`);
  }
  return {
    taxableIncome: base,
    marginalRate: bracket.rate,
    incomeTax,
    localIncomeTax,
    total: incomeTax + localIncomeTax,
    warnings,
  };
}

/** 두 과세표준 시나리오의 세액 차이 (예: 공제 추가 전/후, 장부 vs 추계) */
export function compareIncomeTax(before: number, after: number, taxYear?: number) {
  const a = calcIncomeTax(before, taxYear);
  const b = calcIncomeTax(after, taxYear);
  return { before: a, after: b, saving: a.total - b.total };
}
