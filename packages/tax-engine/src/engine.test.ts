import { test } from "node:test";
import assert from "node:assert/strict";
import { calcIncomeTax, compareIncomeTax, calcGeneralVat, calcSimplifiedVat } from "./index.ts";

test("종소세: 구간 경계에서 누진공제 연속", () => {
  assert.equal(calcIncomeTax(14_000_000).incomeTax, 840_000);
  assert.equal(calcIncomeTax(50_000_000).incomeTax, 6_240_000);
  assert.equal(calcIncomeTax(88_000_000).incomeTax, 15_360_000);
  assert.equal(calcIncomeTax(150_000_000).incomeTax, 37_060_000);
});

test("종소세: 지방소득세 10% 포함", () => {
  const r = calcIncomeTax(30_000_000);
  assert.equal(r.incomeTax, 3_240_000);
  assert.equal(r.localIncomeTax, 324_000);
  assert.equal(r.total, 3_564_000);
});

test("종소세: 미검증 연도 경고", () => {
  assert.equal(calcIncomeTax(1_000_000, 2026).warnings.length, 1);
});

test("종소세: 공제 추가 시 절세액", () => {
  // 노란우산공제 500만원 추가 → 15% 구간이면 약 82.5만원 절세
  assert.equal(compareIncomeTax(40_000_000, 35_000_000).saving, 825_000);
});

test("일반과세 부가세: 매입세액 차감 + 카드발행공제", () => {
  const r = calcGeneralVat({ taxableSales: 50_000_000, deductiblePurchaseTax: 2_000_000, cardSalesIssued: 33_000_000 });
  assert.equal(r.outputTax, 5_000_000);
  assert.equal(r.cardCredit, 429_000);
  assert.equal(r.payable, 2_571_000);
});

test("일반과세 부가세: 환급이면 카드공제 0", () => {
  const r = calcGeneralVat({ taxableSales: 10_000_000, deductiblePurchaseTax: 3_000_000, cardSalesIssued: 11_000_000 });
  assert.equal(r.cardCredit, 0);
  assert.equal(r.payable, -2_000_000);
});

test("간이과세: 4,800만 미만 납부면제", () => {
  assert.equal(calcSimplifiedVat({ grossSales: 40_000_000, valueAddedRatio: 0.15, grossPurchases: 0 }).payable, 0);
});

test("간이과세: 납부세액 계산", () => {
  const r = calcSimplifiedVat({ grossSales: 80_000_000, valueAddedRatio: 0.15, grossPurchases: 20_000_000 });
  assert.equal(r.payable, 1_200_000 - 100_000);
});
