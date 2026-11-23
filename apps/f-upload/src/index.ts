import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { loadFile } from "./files.ts";
import { analyze } from "./assistant.ts";
import { renderMarkdown } from "./report.ts";

const USAGE = `사용법: npm run f -- [옵션] <파일|폴더>...
  --note "간이과세자, 음식점, 2024년 개업"   내 상황 메모
  --year 2025                                귀속/과세 연도
  --dry-run                                  API 호출 없이 전송될 내용만 확인
  --out out                                  결과 폴더 (기본: out)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    note: { type: "string", default: "" },
    year: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    out: { type: "string", default: "out" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help || positionals.length === 0) {
  console.log(USAGE);
  process.exit(positionals.length === 0 && !values.help ? 1 : 0);
}

const paths = positionals.flatMap((p) =>
  fs.statSync(p).isDirectory() ? fs.readdirSync(p).map((f) => path.join(p, f)).filter((f) => fs.statSync(f).isFile()) : [p],
);
const files = paths.map(loadFile);
const taxYear = values.year ? Number(values.year) : undefined;

console.log(`📂 ${files.length}개 파일 로드`);
for (const f of files) {
  console.log(`  - ${f.name} [${f.kind}] 마스킹 ${f.maskedCount}건${f.warning ? `  ⚠️ ${f.warning}` : ""}`);
}

if (values["dry-run"]) {
  for (const f of files) {
    if (f.block.type === "text") console.log(`\n----- ${f.name} (앞 1500자) -----\n${f.block.text.slice(0, 1500)}`);
  }
  console.log("\n(dry-run: API를 호출하지 않았습니다)");
  process.exit(0);
}

console.log("🤖 Claude 분석 중... (수 분 걸릴 수 있음)");
try {
  const { report, message } = await analyze(files, values.note ?? "", taxYear);
  if (message.stop_reason === "refusal") {
    console.error("요청이 거절되었습니다:", message.stop_details);
    process.exit(2);
  }
  if (!report) {
    console.error(`리포트가 제출되지 않았습니다 (stop_reason: ${message.stop_reason}).`);
    for (const b of message.content) if (b.type === "text") console.error(b.text);
    process.exit(2);
  }
  fs.mkdirSync(values.out!, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const md = path.join(values.out!, `report-${stamp}.md`);
  fs.writeFileSync(md, renderMarkdown(report, files.map((f) => f.name)));
  fs.writeFileSync(md.replace(/\.md$/, ".json"), JSON.stringify(report, null, 2));
  console.log(`✅ 완료: ${md}  (절세 포인트 ${report.cards.length}개)`);
  console.log(`   토큰: 입력 ${message.usage.input_tokens} / 출력 ${message.usage.output_tokens} (마지막 요청 기준)`);
} catch (e) {
  if (e instanceof Anthropic.AuthenticationError) {
    console.error("API 키가 없거나 잘못되었습니다. ANTHROPIC_API_KEY 환경변수를 설정하세요.");
  } else if (e instanceof Anthropic.RateLimitError) {
    console.error("요청 한도 초과 — 잠시 후 다시 시도하세요.");
  } else if (e instanceof Anthropic.APIError) {
    console.error(`API 오류 ${e.status}: ${e.message}`);
  } else {
    throw e;
  }
  process.exit(1);
}
