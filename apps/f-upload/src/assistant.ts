import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { calcIncomeTax, compareIncomeTax, calcGeneralVat, calcSimplifiedVat } from "@aiprj/tax-engine";
import type { LoadedFile } from "./files.ts";

export const MODEL = "claude-opus-5-5";

export const ReportSchema = z.object({
  summary: z.string().describe("전체 요약 3~5문장"),
  taxpayer_profile: z.string().describe("자료에서 파악한 사업자 유형·업종·과세유형. 모르면 '미확인'"),
  cards: z.array(
    z.object({
      tax: z.enum(["부가세", "종소세", "공통"]),
      title: z.string(),
      detail: z.string().describe("무엇을 왜 해야 하는지"),
      estimated_saving_won: z.number().nullable().describe("계산 도구로 산출한 금액만. 계산 불가면 null"),
      calculation: z.string().describe("어떤 도구에 어떤 값을 넣었는지"),
      legal_basis: z.string().describe("관련 법조문 또는 국세청 안내. 불확실하면 그렇게 표시"),
      hometax_location: z.string().describe("홈택스에서 입력/확인할 메뉴 경로"),
      confidence: z.enum(["높음", "중간", "낮음"]),
      user_must_confirm: z.array(z.string()).describe("사용자가 사실 확인해야 할 것"),
    }),
  ),
  data_limitations: z.array(z.string()),
  more_documents_needed: z.array(z.string()),
});
export type Report = z.infer<typeof ReportSchema>;

const SYSTEM = `당신은 한국 개인사업자의 부가가치세·종합소득세 "본인 신고"를 돕는 절세 보조 도구입니다.

원칙:
- 사용자가 홈택스에서 내려받아 제공한 자료만 근거로 삼습니다. 자료에 없는 숫자를 만들지 않습니다.
- 세액·절세액은 직접 암산하지 말고 반드시 계산 도구(calc_*, compare_*)로 산출합니다.
- 세법 해석이 불확실하면 confidence를 낮추고 user_must_confirm에 확인할 사항을 적습니다.
- 신고서 제출은 사용자 본인이 합니다. 대리 신고를 하겠다는 표현은 쓰지 않습니다.
- 찾을 것(예시): 매입세액 공제 누락(사업용 카드·현금영수증), 불공제 항목 오분류, 의제매입세액공제,
  신용카드 매출세액공제, 간이/일반과세 유불리, 장부 vs 추계(단순/기준경비율) 비교,
  노란우산공제·연금저축·IRP, 중소기업 특별세액감면, 창업중소기업 감면, 인적공제 누락, 기납부세액 반영 여부.
- 분석이 끝나면 submit_report 도구를 정확히 한 번 호출해 결과를 제출합니다. 다른 형식으로 최종 답을 쓰지 않습니다.`;

export async function analyze(files: LoadedFile[], note: string, taxYear?: number): Promise<{ report: Report | null; message: Anthropic.Beta.BetaMessage }> {
  const client = new Anthropic();
  let report: Report | null = null;

  const tools = [
    betaZodTool({
      name: "calc_income_tax",
      description: "과세표준으로 종합소득세 산출세액과 지방소득세를 계산 (세액공제·감면 전)",
      inputSchema: z.object({ taxable_income: z.number(), tax_year: z.number().int().optional() }),
      run: async (i) => JSON.stringify(calcIncomeTax(i.taxable_income, i.tax_year ?? taxYear)),
    }),
    betaZodTool({
      name: "compare_income_tax",
      description: "두 과세표준(예: 공제 추가 전/후, 장부 vs 추계)의 종소세+지방소득세 차이(절세액)",
      inputSchema: z.object({ before: z.number(), after: z.number(), tax_year: z.number().int().optional() }),
      run: async (i) => JSON.stringify(compareIncomeTax(i.before, i.after, i.tax_year ?? taxYear)),
    }),
    betaZodTool({
      name: "calc_general_vat",
      description: "일반과세자 부가세 납부(환급)세액. 금액 단위 원",
      inputSchema: z.object({
        taxableSales: z.number().describe("과세 매출 공급가액"),
        deductiblePurchaseTax: z.number().describe("공제 가능 매입세액 합계"),
        cardSalesIssued: z.number().optional().describe("카드·현금영수증 매출 발행금액(부가세 포함)"),
        cardCreditUsedThisYear: z.number().optional(),
        otherCredits: z.number().optional(),
      }),
      run: async (i) => JSON.stringify(calcGeneralVat(i)),
    }),
    betaZodTool({
      name: "calc_simplified_vat",
      description: "간이과세자 부가세 납부세액",
      inputSchema: z.object({
        grossSales: z.number().describe("공급대가(부가세 포함 매출)"),
        valueAddedRatio: z.number().describe("업종별 부가가치율 0~1"),
        grossPurchases: z.number().describe("세금계산서 등 수취 매입 공급대가"),
        cardSalesIssued: z.number().optional(),
        cardCreditUsedThisYear: z.number().optional(),
      }),
      run: async (i) => {
        try {
          return JSON.stringify(calcSimplifiedVat(i));
        } catch (e) {
          return `오류: ${(e as Error).message}`;
        }
      },
    }),
    betaZodTool({
      name: "submit_report",
      description: "최종 절세 분석 결과 제출. 분석 마지막에 한 번만 호출",
      inputSchema: ReportSchema,
      run: async (i) => {
        report = i;
        return "제출 완료. 추가 답변 없이 종료하세요.";
      },
    }),
  ];

  const warnings = files.filter((f) => f.warning).map((f) => `- ${f.name}: ${f.warning}`);
  const message = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools,
    max_iterations: 20,
    messages: [
      {
        role: "user",
        content: [
          ...files.map((f) => f.block),
          {
            type: "text",
            text: [
              `위 ${files.length}개 파일은 홈택스에서 내려받은 내 자료입니다.`,
              taxYear ? `대상 귀속/과세연도: ${taxYear}` : "",
              note ? `내 상황 메모: ${note}` : "",
              warnings.length ? `참고:\n${warnings.join("\n")}` : "",
              "부가세·종소세 절세 포인트를 찾아 submit_report로 제출해 주세요.",
            ].filter(Boolean).join("\n"),
          },
        ],
      },
    ],
  });

  return { report, message };
}
