// 세율 데이터. 세법 개정 시 여기만 수정한다.
// ⚠️ 프로토타입용: 실제 신고 전 국세청 최신 고시로 반드시 재확인할 것.

/** 종합소득세 기본세율 (소득세법 §55) — 2023 귀속 개정분 기준 */
export const INCOME_TAX_BRACKETS = [
  { upTo: 14_000_000, rate: 0.06, deduction: 0 },
  { upTo: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { upTo: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { upTo: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { upTo: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { upTo: 500_000_000, rate: 0.4, deduction: 25_940_000 },
  { upTo: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { upTo: Infinity, rate: 0.45, deduction: 65_940_000 },
] as const;

/** 위 세율표를 확인한 마지막 귀속연도. 이후 연도는 경고를 붙인다. */
export const INCOME_TAX_VERIFIED_THROUGH = 2025;

/** 지방소득세 = 종합소득세 산출세액의 10% */
export const LOCAL_INCOME_TAX_RATE = 0.1;

export const VAT_RATE = 0.1;

/** 신용카드매출전표 등 발행세액공제 (부가세법 §46) — 개인사업자 */
export const CARD_SALES_CREDIT = {
  rate: 0.013,
  annualCap: 10_000_000,
  note: "적용 기한·공제율은 매년 일몰 연장 여부 확인 필요",
} as const;

/** 간이과세자 매입세금계산서 등 수취세액공제: 매입 공급대가 × 0.5% */
export const SIMPLIFIED_PURCHASE_CREDIT_RATE = 0.005;
/** 간이과세자 납부의무 면제 기준 (해당 과세기간 공급대가) */
export const SIMPLIFIED_EXEMPTION_THRESHOLD = 48_000_000;
