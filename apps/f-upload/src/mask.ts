// LLM으로 보내기 전 개인식별정보 마스킹 (텍스트로 변환된 자료에만 적용됨)

const RULES: [RegExp, string][] = [
  // 주민등록번호 / 외국인등록번호: 앞 6자리 + 성별자리만 남김
  [/\b(\d{6})[-\s]?([1-8])\d{6}\b/g, "$1-$2******"],
  // 카드번호: 앞 4 + 뒤 4만 남김
  [/\b(\d{4})[-\s]?\d{4}[-\s]?\d{4}[-\s]?(\d{4})\b/g, "$1-****-****-$2"],
  // 계좌번호처럼 보이는 긴 하이픈 숫자열 (예: 110-123-456789)
  [/\b(\d{3,6})-(\d{2,6})-(\d{4,8})\b/g, "$1-****-****"],
];

export function maskPII(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const [re, rep] of RULES) {
    out = out.replace(re, (...args) => {
      count++;
      return rep.replace(/\$(\d)/g, (_, i) => args[Number(i)] ?? "");
    });
  }
  return { text: out, count };
}
