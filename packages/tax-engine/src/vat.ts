import {
  CARD_SALES_CREDIT,
  SIMPLIFIED_EXEMPTION_THRESHOLD,
  SIMPLIFIED_PURCHASE_CREDIT_RATE,
  VAT_RATE,
} from "./rates.ts";

export interface GeneralVatInput {
  /** 과세 매출 공급가액 (영세율 제외) */
  taxableSales: number;
  /** 공제 가능한 매입세액 합계 (세금계산서·카드·현금영수증, 불공제분 제외) */
  deductiblePurchaseTax: number;
  /** 신용카드·현금영수증 매출 발행금액 (부가세 포함) */
  cardSalesIssued?: number;
  /** 이번 연도에 이미 받은 카드발행세액공제 (연 한도 계산용) */
  cardCreditUsedThisYear?: number;
  /** 기타 경감·공제세액 (전자신고 세액공제 등) */
  otherCredits?: number;
}

const won = (n: number) => Math.floor(n);

/** 일반과세자 부가세 납부(환급)세액 */
export function calcGeneralVat(input: GeneralVatInput) {
  const outputTax = won(input.taxableSales * VAT_RATE);
  const base = outputTax - won(input.deductiblePurchaseTax);
  const cardCredit = cardSalesCredit(
    input.cardSalesIssued ?? 0,
    input.cardCreditUsedThisYear ?? 0,
    Math.max(0, base),
  );
  const other = won(input.otherCredits ?? 0);
  return {
    outputTax,
    deductiblePurchaseTax: won(input.deductiblePurchaseTax),
    cardCredit,
    otherCredits: other,
    payable: base - cardCredit - other, // 음수면 환급
    notes: [CARD_SALES_CREDIT.note],
  };
}

export interface SimplifiedVatInput {
  /** 과세기간 공급대가 (부가세 포함 매출) */
  grossSales: number;
  /** 업종별 부가가치율 (예: 음식점 0.15, 소매 0.15, 서비스 0.3~0.4) */
  valueAddedRatio: number;
  /** 세금계산서 등 수취분 매입 공급대가 */
  grossPurchases: number;
  cardSalesIssued?: number;
  cardCreditUsedThisYear?: number;
}

/** 간이과세자 부가세 납부세액 (환급 없음) */
export function calcSimplifiedVat(input: SimplifiedVatInput) {
  if (input.valueAddedRatio <= 0 || input.valueAddedRatio > 1) {
    throw new RangeError("부가가치율은 0~1 사이 값이어야 합니다");
  }
  if (input.grossSales < SIMPLIFIED_EXEMPTION_THRESHOLD) {
    return { exempt: true, payable: 0, notes: ["공급대가 4,800만원 미만 — 납부의무 면제"] };
  }
  const tax = won(input.grossSales * input.valueAddedRatio * VAT_RATE);
  const purchaseCredit = won(input.grossPurchases * SIMPLIFIED_PURCHASE_CREDIT_RATE);
  const afterPurchase = Math.max(0, tax - purchaseCredit);
  const cardCredit = cardSalesCredit(
    input.cardSalesIssued ?? 0,
    input.cardCreditUsedThisYear ?? 0,
    afterPurchase,
  );
  return {
    exempt: false,
    tax,
    purchaseCredit,
    cardCredit,
    payable: Math.max(0, afterPurchase - cardCredit),
    notes: ["간이과세자는 공제세액이 납부세액을 초과해도 환급되지 않음", CARD_SALES_CREDIT.note],
  };
}

/** 카드발행세액공제: 발행금액 × 1.3%, 연 1,000만원 한도, 납부세액 한도 */
export function cardSalesCredit(issued: number, usedThisYear: number, payableLimit: number) {
  const raw = won(issued * CARD_SALES_CREDIT.rate);
  const remainingCap = Math.max(0, CARD_SALES_CREDIT.annualCap - usedThisYear);
  return Math.max(0, Math.min(raw, remainingCap, payableLimit));
}
