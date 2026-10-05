import { roundDiv } from '../core/jikju.js';

const NF = new Intl.NumberFormat('ko-KR');

export function num(n) {
  return n === null || n === undefined ? '—' : NF.format(n);
}

export function pct(tenths) {
  if (tenths === null || tenths === undefined) return '—';
  const sign = tenths < 0 ? '-' : '';
  const a = Math.abs(tenths);
  return `${sign}${Math.floor(a / 10)}.${a % 10}%`;
}

export function manwon(m) {
  if (m === null || m === undefined) return '—';
  const eok = Math.floor(m / 10000);
  const rest = m % 10000;
  if (eok === 0) return `${NF.format(rest)}만`;
  if (rest === 0) return `${NF.format(eok)}억`;
  return `${NF.format(eok)}억 ${NF.format(rest)}만`;
}

export function dist(m, unitM = 10) {
  if (m === null || m === undefined) return '—';
  if (m < 1000) return `${roundDiv(m, unitM) * unitM}m`;
  const hm = roundDiv(m, 100); // 100m 단위
  return `${Math.floor(hm / 10)}.${hm % 10}km`;
}

export function ym(s) {
  if (typeof s !== 'string') return '—';
  const m = s.match(/^(\d{4})-?(\d{2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}월` : s;
}

export function ymd(s) {
  const m = typeof s === 'string' ? s.match(/^(\d{4})(\d{2})(\d{2})$/) : null;
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s ?? '—');
}

export function stamp(iso) {
  const m = typeof iso === 'string' ? iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/) : null;
  return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : '—';
}

export function buildStamp(buildId) {
  const s = String(buildId ?? '');
  return /^\d{14}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : s || '—';
}

export function regionName(r, legacyTag) {
  if (!r) return '—';
  return r.name_note ? `${r.name} ${legacyTag}` : r.name;
}

export function csvRow(cells) {
  return cells.map((c) => {
    const s = c === null || c === undefined ? '' : String(c);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}
