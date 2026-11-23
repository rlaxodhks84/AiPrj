#!/usr/bin/env node
// Claude Code hook: 대화 내용을 ConvLogAi.md에 기록하고 git push, 작업 완료 시 OS 알림.
//   node conv-log.js prompt  -> UserPromptSubmit: 사용자 프롬프트 기록
//   node conv-log.js stop    -> Stop: Claude 응답 기록 + commit/push + 알림
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const mode = process.argv[2];
const LOG_NAME = 'ConvLogAi.md';

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
}

// transcript(JSONL)에서 마지막 실제 사용자 프롬프트 이후의 assistant 텍스트를 모음
function lastAssistantText(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    const msg = e.message || {};
    if (e.type === 'user' && !e.isMeta) {
      const c = msg.content;
      const isToolResult = Array.isArray(c) && c.some((b) => b && b.type === 'tool_result');
      if (!isToolResult) break;
    } else if (e.type === 'assistant') {
      const t = textOf(msg.content).trim();
      if (t) out.unshift(t);
    }
  }
  return out.join('\n\n');
}

function notify(title, body) {
  const opts = { detached: true, stdio: 'ignore', windowsHide: true };
  try {
    if (process.platform === 'win32') {
      const esc = (s) => s.replace(/'/g, "''").replace(/[<>&]/g, ' ');
      const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${esc(title)}</text><text>${esc(body)}</text></binding></visual></toast>')
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
      spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], opts).unref();
    } else if (process.platform === 'darwin') {
      const q = (s) => JSON.stringify(s);
      spawn('osascript', ['-e', `display notification ${q(body)} with title ${q(title)}`], opts).unref();
    } else {
      spawn('notify-send', [title, body], opts).unref();
    }
  } catch { /* 알림 실패는 무시 */ }
}

const input = readStdin();
const cwd = input.cwd || process.cwd();
let root;
try { root = git(['rev-parse', '--show-toplevel'], cwd); } catch { process.exit(0); }
const logFile = path.join(root, LOG_NAME);
let user = 'unknown';
try { user = git(['config', 'user.name'], root) || user; } catch {}
const session = (input.session_id || '').slice(0, 8);

if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '# AI 대화 로그\n');

if (mode === 'prompt') {
  const prompt = (input.prompt || '').trim();
  if (prompt) {
    fs.appendFileSync(logFile, `\n---\n\n### 👤 ${user} · ${now()} · session ${session}\n\n${prompt}\n`);
  }
  process.exit(0);
}

if (mode === 'stop') {
  const reply = (input.last_assistant_message || lastAssistantText(input.transcript_path) || '').trim();
  if (reply) fs.appendFileSync(logFile, `\n### 🤖 Claude · ${now()}\n\n${reply}\n`);

  let status = '대화 로그 push 완료';
  try {
    git(['add', '--', LOG_NAME], root);
    // ConvLogAi.md만 커밋 (다른 staged 변경은 건드리지 않음)
    git(['commit', '-m', `chore(log): ${user} 대화 기록 ${now()}`, '--', LOG_NAME], root);
    try {
      git(['push'], root);
    } catch {
      try {
        git(['pull', '--rebase', '--autostash'], root);
        git(['push'], root);
      } catch (e) {
        status = 'push 실패 (로컬 커밋만 됨)';
      }
    }
  } catch {
    status = '변경 없음 / 커밋 실패';
  }

  notify('Claude Code 작업 완료', `${path.basename(root)} · ${status}`);
  process.stdout.write(JSON.stringify({ systemMessage: `✅ 작업 완료 · ${LOG_NAME}: ${status}` }));
  process.exit(0);
}
