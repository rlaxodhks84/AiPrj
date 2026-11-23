import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type Anthropic from "@anthropic-ai/sdk";
import { maskPII } from "./mask.ts";

export interface LoadedFile {
  name: string;
  kind: "sheet" | "text" | "pdf" | "image";
  block: Anthropic.Beta.BetaContentBlockParam;
  maskedCount: number;
  warning?: string;
}

const MAX_BYTES = 30 * 1024 * 1024; // 요청 한도(32MB) 이하로

export function loadFile(filePath: string): LoadedFile {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  if (buf.length > MAX_BYTES) {
    throw new Error(`${name}: 파일이 너무 큽니다 (${(buf.length / 1e6).toFixed(1)}MB). 기간을 나눠 다시 내려받아 주세요.`);
  }

  if ([".xls", ".xlsx", ".html", ".htm"].includes(ext)) {
    // 홈택스 엑셀은 실제로는 HTML 테이블인 경우가 많은데 SheetJS가 둘 다 읽는다
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const parts = wb.SheetNames.map((s) => `## 시트: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s]!, { blankrows: false })}`);
    const { text, count } = maskPII(parts.join("\n\n"));
    return { name, kind: "sheet", maskedCount: count, block: textBlock(name, text) };
  }

  if ([".csv", ".txt", ".tsv"].includes(ext)) {
    const { text, count } = maskPII(decodeKorean(buf));
    return { name, kind: "text", maskedCount: count, block: textBlock(name, text) };
  }

  if (ext === ".pdf") {
    return {
      name,
      kind: "pdf",
      maskedCount: 0,
      warning: "PDF는 마스킹 없이 원본이 전송됩니다 (주민번호 등이 포함될 수 있음)",
      block: {
        type: "document",
        title: name,
        source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
      },
    };
  }

  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    const media = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return {
      name,
      kind: "image",
      maskedCount: 0,
      warning: "이미지는 마스킹 없이 원본이 전송됩니다",
      block: { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
    };
  }

  throw new Error(`${name}: 지원하지 않는 형식 (${ext}). xls/xlsx/csv/pdf/png/jpg만 가능`);
}

function textBlock(name: string, text: string): Anthropic.Beta.BetaTextBlockParam {
  return { type: "text", text: `<file name="${name}">\n${text}\n</file>` };
}

/** 홈택스 CSV는 EUC-KR(CP949)인 경우가 있어 UTF-8 실패 시 재시도 */
function decodeKorean(buf: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  return new TextDecoder("euc-kr").decode(buf);
}
