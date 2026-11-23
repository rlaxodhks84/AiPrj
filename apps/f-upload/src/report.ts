import type { Report } from "./assistant.ts";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function renderMarkdown(r: Report, files: string[]): string {
  const total = r.cards.reduce((s, c) => s + (c.estimated_saving_won ?? 0), 0);
  const lines = [
    `# 절세 분석 리포트`,
    ``,
    `> ⚠️ 참고용 분석입니다. 최종 판단과 신고는 본인이 하며, 세율·공제 요건은 국세청 최신 안내로 확인하세요.`,
    ``,
    `- 분석 파일: ${files.join(", ")}`,
    `- 사업자 정보: ${r.taxpayer_profile}`,
    `- 예상 절세액 합계(계산 가능 항목만): **${won(total)}**`,
    ``,
    `## 요약`,
    r.summary,
    ``,
    `## 절세 포인트`,
  ];
  const order = { 높음: 0, 중간: 1, 낮음: 2 } as const;
  [...r.cards]
    .sort((a, b) => order[a.confidence] - order[b.confidence] || (b.estimated_saving_won ?? 0) - (a.estimated_saving_won ?? 0))
    .forEach((c, i) => {
      lines.push(
        ``,
        `### ${i + 1}. [${c.tax}] ${c.title}  (확신도: ${c.confidence})`,
        c.detail,
        ``,
        `- 예상 절세액: ${c.estimated_saving_won == null ? "계산 불가" : won(c.estimated_saving_won)}`,
        `- 계산: ${c.calculation}`,
        `- 근거: ${c.legal_basis}`,
        `- 홈택스 위치: ${c.hometax_location}`,
        ...(c.user_must_confirm.length ? [`- 직접 확인할 것:`, ...c.user_must_confirm.map((x) => `  - [ ] ${x}`)] : []),
      );
    });
  if (r.data_limitations.length) lines.push(``, `## 자료의 한계`, ...r.data_limitations.map((x) => `- ${x}`));
  if (r.more_documents_needed.length) lines.push(``, `## 추가로 있으면 좋은 자료`, ...r.more_documents_needed.map((x) => `- ${x}`));
  return lines.join("\n") + "\n";
}
