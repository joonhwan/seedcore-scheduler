#!/usr/bin/env node
/**
 * 공수표 CSV(품명·공정·투입공수·투입인원·총공수, 시간 단위) → SAM Scheduler 일정 가져오기 CSV.
 *
 * 사용법 (저장소 루트에서):
 *   node .claude/skills/sam-workload-import-csv/scripts/workload-to-import-csv.mjs \
 *     <입력.csv> <출력.csv> --start YYYY-MM-DD [--groups 규칙.json] [--holidays YYYY-MM-DD,...]
 *
 * 일정 규칙 — "행 순서대로 한 줄":
 *   - 모든 행을 위에서부터 이어 붙인다. 투입공수(시간)를 누적하고 하루 8시간으로 잘라 근무일을 정한다.
 *     그래서 12h 작업 뒤의 6h 작업은 같은 날에 걸쳐 겹치고, 0.5h 같은 짧은 작업은 앞 작업과 같은 날에 들어간다.
 *   - 기간은 투입공수(1인당 시간)로 잡는다. 투입인원이 여럿이면 동시에 붙는 것으로 본다(총공수가 아님).
 *   - 공수 0(미정) 항목은 다음 날 아침부터 하루를 통째로 잡는다. 날짜 칸이 비면 서버가 "오늘"을 넣어 버린다.
 *   - 토·일·공휴일은 근무일에서 뺀다.
 *
 * 쓰고 나서 서버 importCsv() 와 같은 파싱 규칙으로 다시 읽어 검증하고, 실패하면 exit 1.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const HOURS_PER_DAY = 8;
const MIN_PER_DAY = HOURS_PER_DAY * 60;
// 기본 공휴일. 일정이 이 범위를 넘어가면 --holidays 로 더 넘긴다.
const DEFAULT_HOLIDAYS = ['2026-12-25', '2027-01-01'];

// ── 입력 CSV 파서 (RFC 4180: 따옴표 안 쉼표·"" 이스케이프·줄바꿈 처리) ─────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ── 날짜 (UTC 로만 계산해 시간대 영향을 없앤다) ─────────────────────────────────────
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function makeCalendar(start, holidays) {
  const isOff = (d) => [0, 6].includes(d.getUTCDay()) || holidays.has(iso(d));
  const days = [];
  let d = toDate(start);
  return {
    isOff,
    /** idx 번째 근무일 (0 = 시작일 또는 그 뒤 첫 근무일) */
    workday(idx) {
      while (days.length <= idx) {
        while (isOff(d)) d = addDays(d, 1);
        days.push(iso(d));
        d = addDays(d, 1);
      }
      return days[idx];
    },
  };
}

// ── 입력 읽기 ───────────────────────────────────────────────────────────────
function loadTasks(path) {
  const rows = parseCsv(fs.readFileSync(path, 'utf8').replace(/^﻿/, ''));
  const header = rows[0].map((h) => h.replace(/\s/g, ''));
  const col = (prefix) => {
    const i = header.findIndex((h) => h.startsWith(prefix));
    if (i < 0) fail(`입력 헤더에 "${prefix}" 열이 없습니다: ${rows[0].join(',')}`);
    return i;
  };
  const [cName, cProc, cHours, cPeople] = ['품명', '공정', '투입공수', '투입인원'].map(col);
  return rows.slice(1)
    .filter((r) => (r[cName] ?? '').trim())
    .map((r, i) => {
      const hours = Number((r[cHours] ?? '').trim() || 0);
      if (!Number.isFinite(hours) || hours < 0) fail(`${i + 2}행 투입공수가 숫자가 아닙니다: "${r[cHours]}"`);
      return {
        name: r[cName].split(/\s+/).filter(Boolean).join(' '), // 앞뒤·연속 공백 정리
        proc: (r[cProc] ?? '').trim(),
        minutes: Math.round(hours * 60),
        people: (r[cPeople] ?? '').trim(),
      };
    });
}

// ── 일정 계산 ───────────────────────────────────────────────────────────────
function scheduleSerial(tasks) {
  let cum = 0;
  for (const t of tasks) {
    if (t.minutes > 0) {
      t.m0 = cum; t.m1 = cum + t.minutes;
    } else {
      t.m0 = Math.ceil(cum / MIN_PER_DAY) * MIN_PER_DAY;
      t.m1 = t.m0 + MIN_PER_DAY;
    }
    cum = t.m1;
    t.d0 = Math.floor(t.m0 / MIN_PER_DAY);
    t.d1 = Math.max(t.d0, Math.ceil(t.m1 / MIN_PER_DAY) - 1);
  }
}

// ── 그룹 규칙 ───────────────────────────────────────────────────────────────
function assignGroups(tasks, rulesPath) {
  const { rules, default: fallback } = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  const compiled = rules.map((r) => ({ ...r, re: new RegExp(r.pattern) }));
  for (const t of tasks) {
    const hit = compiled.find((r) => r.re.test(t.name) && (!r.process || r.process === t.proc));
    t.group = hit ? hit.group : fallback;
    if (!t.group) fail(`어느 그룹 규칙에도 맞지 않고 default 도 없습니다: ${t.name}`);
  }
  // 같은 그룹이 떨어진 두 곳에 나오면 앱에 같은 이름의 그룹이 두 개 생긴다
  const seen = new Set();
  tasks.forEach((t, i) => {
    if (i > 0 && tasks[i - 1].group === t.group) return;
    if (seen.has(t.group)) fail(`그룹 "${t.group}" 이 연속되지 않습니다 (${i + 2}행 "${t.name}"). 규칙을 고치세요.`);
    seen.add(t.group);
  });
  return seen.size;
}

// ── 출력 ────────────────────────────────────────────────────────────────────
function writeImportCsv(path, tasks, cal, grouped) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [[...(grouped ? ['일정1', '일정2'] : ['일정1']), '시작일', '종료일', '진척율']];
  let prev = null;
  for (const t of tasks) {
    if (grouped && t.group !== prev) {
      prev = t.group;
      lines.push([t.group, '', '', '', '']); // GROUP 기간·진척율은 서버가 자식에서 계산한다
    }
    const title = `[${t.proc}] ${t.name}`;
    lines.push([...(grouped ? ['', title] : [title]), cal.workday(t.d0), cal.workday(t.d1), '0%']);
  }
  // BOM: 엑셀에서 한글이 깨지지 않게. 앱은 FileReader·trim() 단계에서 BOM 을 떨군다.
  fs.writeFileSync(path, '﻿' + lines.map((l) => l.map(q).join(',')).join('\r\n') + '\r\n', 'utf8');
}

// ── 검증: apps/api/src/nodes/nodes.service.ts importCsv() 의 parseCsvLine 을 그대로 따른다 ──
function verify(path, tasks, cal) {
  const serverParse = (line) => {
    const out = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out.map((v) => v.replace(/""/g, '"').trim());
  };
  const rows = fs.readFileSync(path, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(serverParse);
  const errs = [];
  const k = rows[0].indexOf('시작일'); // csv-layout.ts: 시작일 앞 열 개수 = 트리 깊이 열 개수
  if (!(k >= 1 && rows[0][k + 1] === '종료일' && rows[0][k + 2] === '진척율')) errs.push(`헤더 이상: ${rows[0]}`);
  let items = 0, prevStart = '';
  rows.slice(1).forEach((r, i) => {
    if (r.length !== k + 3) errs.push(`${i + 2}행 열 개수 ${r.length}`);
    const depth = r.slice(0, k).findIndex((c) => c);
    if (depth < 0) return errs.push(`${i + 2}행 제목 없음`);
    if (k > 1 && depth === 0) { if (r[k] || r[k + 1]) errs.push(`${i + 2}행 그룹에 날짜가 있음`); return; }
    const t = tasks[items++];
    const [s, e] = [r[k], r[k + 1]];
    if (r[depth] !== `[${t?.proc}] ${t?.name}`) errs.push(`${i + 2}행 제목 불일치: ${r[depth]}`);
    for (const d of [s, e]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || cal.isOff(toDate(d))) errs.push(`${i + 2}행 날짜 ${d} (형식 오류 또는 휴일)`);
    if (s > e) errs.push(`${i + 2}행 시작일 > 종료일`);
    if (s < prevStart) errs.push(`${i + 2}행 시작일이 앞 행보다 이름`);
    prevStart = s;
  });
  if (items !== tasks.length) errs.push(`항목 수 ${items} ≠ 입력 ${tasks.length}`);
  if (errs.length) fail(`검증 실패:\n  ${errs.join('\n  ')}`);
}

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── main ────────────────────────────────────────────────────────────────────
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { start: { type: 'string' }, groups: { type: 'string' }, holidays: { type: 'string' } },
});
const [input, output] = positionals;
if (!input || !output) fail('사용법: workload-to-import-csv.mjs <입력.csv> <출력.csv> --start YYYY-MM-DD [--groups 규칙.json] [--holidays d1,d2]');
if (!/^\d{4}-\d{2}-\d{2}$/.test(values.start ?? '')) fail('--start YYYY-MM-DD 가 필요합니다. 착수일은 짐작하지 말고 사용자에게 확인하세요.');

const holidays = new Set([...DEFAULT_HOLIDAYS, ...(values.holidays?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])]);
const cal = makeCalendar(values.start, holidays);
const tasks = loadTasks(input);
if (!tasks.length) fail('입력에 작업 행이 없습니다.');
scheduleSerial(tasks);
const groupCount = values.groups ? assignGroups(tasks, values.groups) : 0;
writeImportCsv(output, tasks, cal, !!values.groups);
verify(output, tasks, cal);

const last = Math.max(...tasks.map((t) => t.d1));
const totalH = tasks.reduce((s, t) => s + t.minutes, 0) / 60;
console.log(`✓ ${output}`);
console.log(`  항목 ${tasks.length}개${values.groups ? `, 그룹 ${groupCount}개` : ''} · 공수 합계 ${totalH}h`);
console.log(`  ${cal.workday(0)} ~ ${cal.workday(last)} (근무일 ${last + 1}일)`);
const zero = tasks.filter((t) => t.minutes === 0);
if (zero.length) console.log(`  ⚠ 공수 0(미정) → 1일로 잡음: ${zero.map((t) => t.name).join(' / ')}`);
const multi = tasks.filter((t) => Number(t.people) > 1);
if (multi.length) console.log(`  ℹ 투입인원 2명 이상(기간은 1인 공수 기준): ${multi.map((t) => `${t.name}(${t.people}명)`).join(' / ')}`);
