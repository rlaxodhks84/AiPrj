import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPII } from "./mask.ts";

test("주민번호·카드번호·계좌번호 마스킹, 날짜·금액은 유지", () => {
  const { text, count } = maskPII("홍길동,850101-1234567,1234-5678-9012-3456,110-123-456789,2026-11-24,1,234,000");
  assert.equal(text, "홍길동,850101-1******,1234-****-****-3456,110-****-****,2026-11-24,1,234,000");
  assert.equal(count, 3);
});
