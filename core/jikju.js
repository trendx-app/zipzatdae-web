
export class JikjuValueError extends RangeError {
  constructor(message) {
    super(message);
    this.name = 'JikjuValueError';
  }
}

export const MAX_MANWON = 2_000_000_000;


function fail(msg) {
  throw new JikjuValueError(msg);
}

function int(v, what) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) fail(`${what}: 정수가 아니다 ${String(v)}`);
  return v;
}

function manwon(v, what) {
  const n = int(v, what);
  if (n < 0 || n > MAX_MANWON) fail(`${what}: 만원 범위 밖 ${n}`);
  return n;
}

function topNGuard(v) {
  const n = int(v, 'topN');
  if (n < 0) fail('topN >= 0');
  return n;
}

function finite(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what}: 수가 아니다 ${String(v)}`);
  return v;
}

function req(obj, key, what) {
  if (obj === null || typeof obj !== 'object' || obj[key] === undefined) fail(`${what}.${key} 없음`);
  return obj[key];
}

function opt(obj, key) {
  const v = obj == null ? undefined : obj[key];
  return v === undefined ? null : v;
}

export function compareCodePoints(a, b) {
  const A = Array.from(String(a));
  const B = Array.from(String(b));
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i += 1) {
    const x = A[i].codePointAt(0);
    const y = B[i].codePointAt(0);
    if (x !== y) return x < y ? -1 : 1;
  }
  return A.length - B.length;
}


export function roundDiv(n, d) {
  int(n, 'n');
  int(d, 'd');
  if (d <= 0) fail('d must be > 0');
  const N = BigInt(n);
  const D = BigInt(d);
  const q = N >= 0n ? (N * 2n + D) / (2n * D) : -((-N * 2n + D) / (2n * D));
  return Number(q); // |q| ≤ |n| 이라 안전 정수
}


export function isKorean(lang) {
  let p = String(lang);
  for (const sep of ['-', '_']) {
    const i = p.indexOf(sep);
    if (i >= 0) p = p.slice(0, i);
  }
  let out = '';
  for (const ch of p) out += ch >= 'A' && ch <= 'Z' ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch;
  return out === 'ko';
}


const DEG_TO_RAD = Math.PI / 180; // 파이썬 math.radians 와 같은 상수(x · (π/180))

export function haversineM(lat1, lng1, lat2, lng2, earthRadiusM) {
  finite(lat1, 'lat1');
  finite(lng1, 'lng1');
  finite(lat2, 'lat2');
  finite(lng2, 'lng2');
  const R = int(earthRadiusM, 'earthRadiusM');
  if (R <= 0) fail('earthRadiusM > 0');
  const p1 = lat1 * DEG_TO_RAD;
  const p2 = lat2 * DEG_TO_RAD;
  const dphi = p2 - p1;
  const dlmb = (lng2 - lng1) * DEG_TO_RAD;
  const s1 = Math.sin(dphi / 2);
  const s2 = Math.sin(dlmb / 2);
  const h = s1 * s1 + Math.cos(p1) * Math.cos(p2) * (s2 * s2);
  const d = 2.0 * R * Math.asin(Math.sqrt(Math.min(1.0, h)));
  return Math.floor(d + 0.5);
}


export function affordable(budgetManwon, priceManwon) {
  const budget = manwon(budgetManwon, 'budgetManwon');
  if (priceManwon === null || priceManwon === undefined) return null;
  const price = manwon(priceManwon, 'priceManwon');
  if (price === 0) return null;
  return { pass: budget >= price, marginTenths: roundDiv((budget - price) * 1000, price) };
}


export function homeShareRank(cells, ageBand, sex, topN) {
  const n = topNGuard(topN);
  if (!Array.isArray(cells)) fail('cells: 배열이 아니다');
  const a = ageBand === undefined ? null : ageBand;
  const s = sex === undefined ? null : sex;
  const sel = cells.filter((c) => (a === null || opt(c, 'ageBand') === a) && (s === null || opt(c, 'sex') === s));
  if (sel.length === 0) return { rows: [], sumCnt: 0, partial: false, maskedRatioTenths: 0 };
  const byHome = new Map(); // home → cnt | null
  let nullCells = 0;
  for (const c of sel) {
    const h = req(c, 'home', 'cell');
    const cnt = opt(c, 'cnt');
    if (cnt === null) {
      nullCells += 1;
      byHome.set(h, null);
    } else if (!byHome.has(h)) {
      byHome.set(h, int(cnt, 'cell.cnt'));
    } else if (byHome.get(h) !== null) {
      byHome.set(h, byHome.get(h) + int(cnt, 'cell.cnt'));
    }
  }
  const known = [...byHome.entries()].filter(([, v]) => v !== null);
  const sumCnt = known.reduce((acc, [, v]) => acc + v, 0);
  known.sort(([h1, v1], [h2, v2]) => (v1 !== v2 ? v2 - v1 : compareCodePoints(h1, h2)));
  const rows = known.slice(0, n).map(([home, cnt]) => ({ home, cnt, shareTenths: sumCnt > 0 ? roundDiv(cnt * 1000, sumCnt) : 0 }));
  return { rows, sumCnt, partial: nullCells > 0, maskedRatioTenths: roundDiv(nullCells * 1000, sel.length) };
}


export const COMPARE_METRICS = Object.freeze([
  ['distanceM', 'min'],
  ['shareTenths', 'max'],
  ['workplaces', 'max'],
  ['members', 'max'],
  ['tradeMedianManwon', 'min'],
  ['jeonseMedianManwon', 'min'],
  ['ratioTenths', 'min'],
]);

export function compareRegions(regions) {
  if (!Array.isArray(regions) || regions.length === 0 || regions.length > 3) fail('regions 1..3');
  const codes = regions.map((r) => req(r, 'code', 'region'));
  if (new Set(codes).size !== codes.length) fail('duplicate code');
  const out = {};
  for (const [metric, direction] of COMPARE_METRICS) {
    const known = regions.filter((r) => opt(r, metric) !== null).map((r) => [finite(r[metric], metric), r.code]);
    const missing = regions.filter((r) => opt(r, metric) === null).map((r) => r.code).sort(compareCodePoints);
    known.sort(([v1, c1], [v2, c2]) => {
      if (v1 !== v2) return direction === 'max' ? v2 - v1 : v1 - v2;
      return compareCodePoints(c1, c2);
    });
    const order = known.map(([, c]) => c);
    out[metric] = { best: order.length > 0 ? order[0] : null, order, missing };
  }
  return out;
}


export function shuttleCandidates(rows, topN, minCluster) {
  const n = topNGuard(topN);
  const mc = int(minCluster, 'minCluster');
  if (!Array.isArray(rows)) fail('rows: 배열이 아니다');
  const known = rows.filter((r) => opt(r, 'members') !== null);
  const missing = rows.filter((r) => opt(r, 'members') === null).map((r) => req(r, 'dongCode', 'row')).sort(compareCodePoints);
  const total = known.reduce((acc, r) => acc + int(r.members, 'row.members'), 0);
  known.sort((x, y) => (x.members !== y.members ? y.members - x.members : compareCodePoints(req(x, 'dongCode', 'row'), req(y, 'dongCode', 'row'))));
  const top = known.slice(0, n).map((r, i) => ({
    rank: i + 1,
    sgg: req(r, 'sgg', 'row'),
    dongCode: req(r, 'dongCode', 'row'),
    emdName: opt(r, 'emdName'),
    members: r.members,
    workplaces: opt(r, 'workplaces'),
    big: opt(r, 'big'),
    shareTenths: total > 0 ? roundDiv(r.members * 1000, total) : 0,
  }));
  const coverageTenths = total > 0 ? roundDiv(top.reduce((acc, t) => acc + t.members, 0) * 1000, total) : 0;
  const bySgg = new Map(); // 삽입 순서 = top 순서
  for (const t of top) {
    if (!bySgg.has(t.sgg)) bySgg.set(t.sgg, []);
    bySgg.get(t.sgg).push(t);
  }
  const clusters = [];
  for (const [sgg, ts] of bySgg) {
    if (ts.length >= mc) {
      const m = ts.reduce((acc, t) => acc + t.members, 0);
      clusters.push({ sgg, dongCodes: ts.map((t) => t.dongCode), members: m, shareTenths: total > 0 ? roundDiv(m * 1000, total) : 0 });
    }
  }
  clusters.sort((x, y) => (x.members !== y.members ? y.members - x.members : compareCodePoints(x.sgg, y.sgg)));
  return { top, clusters, totalMembers: total, coverageTenths, missing };
}


function code(v, n, what) {
  if (typeof v !== 'string' || v.length !== n || !/^[0-9]+$/.test(v)) fail(`${what}: ${n}자리 숫자 코드가 아니다 ${String(v)}`);
  return v;
}

function codes5(v, what) {
  if (!Array.isArray(v)) fail(`${what}: 목록이 아니다`);
  const out = v.map((s) => code(s, 5, what));
  if (new Set(out).size !== out.length) fail(`${what}: 코드 중복`);
  return out;
}

export function excludeFlaggedHomes(shareRows, flaggedHomes) {
  if (!Array.isArray(shareRows)) fail('shareRows');
  const flagged = new Set();
  for (const h of flaggedHomes ?? []) flagged.add(code(h, 5, 'flaggedHomes[]'));
  const rows = [];
  const present = new Set();
  for (const r of shareRows) {
    const h = r !== null && typeof r === 'object' ? r.home : undefined;
    if (typeof h !== 'string') fail('row.home');
    if (flagged.has(h)) present.add(h);
    else rows.push(r);
  }
  return { rows, excluded: [...present].sort(compareCodePoints) };
}


export const JIKJU_FILE_PREFIX = 'jikju/v1/f/';
export const JIKJU_PUBLIC_PATH = '/storage/v1/object/public/zipzatdae-public/';
const SHA16 = /^[0-9a-f]{16}$/;

export function jikjuFilePath(files, name) {
  if (files === null || typeof files !== 'object' || Array.isArray(files) || typeof name !== 'string' || name === '') fail('files·name');
  if (!Object.hasOwn(files, name)) fail(`없는 이름 ${name}`);
  const sha = files[name];
  if (typeof sha !== 'string' || !SHA16.test(sha)) fail(`sha16 형식 ${String(sha)}`);
  const path = `${JIKJU_FILE_PREFIX}${sha}.json.gz`;
  return { path, urlPath: JIKJU_PUBLIC_PATH + path };
}


export function jikjuHomeAllowed(workSgg, homeSgg, allowed) {
  const work = code(workSgg, 5, 'workSgg');
  const home = code(homeSgg, 5, 'homeSgg');
  if (allowed === null || typeof allowed !== 'object' || Array.isArray(allowed) || !Object.hasOwn(allowed, work)) fail(`${work}: allowed 에 없는 직장`);
  return new Set(codes5(allowed[work], 'allowed[work]')).has(home);
}


export function drtCandidates(shareRows, gap, topN) {
  if (int(topN, 'topN') <= 0) fail('topN > 0');
  if (!Array.isArray(shareRows)) fail('shareRows: 배열이 아니다');
  if (gap === null || typeof gap !== 'object') fail('gap: 객체가 아니다');
  const head = shareRows.slice(0, topN);
  const rows = [];
  const noData = [];
  for (const r of head) {
    const home = req(r, 'home', 'shareRow');
    const g = Object.hasOwn(gap, home) ? gap[home] : null;
    if (g === null || g === undefined) {
      noData.push(home);
    } else if (int(req(g, 'gap', 'gap'), 'gap.gap') >= 1) {
      rows.push({
        home,
        cnt: int(req(r, 'cnt', 'shareRow'), 'shareRow.cnt'),
        shareTenths: int(req(r, 'shareTenths', 'shareRow'), 'shareRow.shareTenths'),
        complexes: int(req(g, 'complexes', 'gap'), 'gap.complexes'),
        gap: g.gap,
      });
    }
  }
  rows.sort((x, y) => compareCodePoints(x.home, y.home));
  noData.sort(compareCodePoints);
  return { rows, noData, gapSum: rows.reduce((acc, x) => acc + x.gap, 0) };
}


const AGE_CODES = new Set(['20', '25', '30', '35', '40', '45', '50', '55', '60']); // 공개판 5세 코드(문자열 정확 일치)
const AGE_LEGACY = new Map([
  ['u20', ['20세 미만', '<20']],
  ['20s', ['20대', '20–29']],
  ['30s', ['30대', '30–39']],
  ['40s', ['40대', '40–49']],
  ['50s', ['50대', '50–59']],
  ['60p', ['60세 이상', '60+']],
]);

export function ageBandLabel(code, lang, codeIsUpperBound) {
  if (code === null || code === undefined) return null;
  if (typeof codeIsUpperBound !== 'boolean') fail('codeIsUpperBound: 불리언이 아니다');
  const ko = isKorean(lang);
  if (typeof code !== 'string') return code;
  if (AGE_LEGACY.has(code)) return AGE_LEGACY.get(code)[ko ? 0 : 1];
  if (AGE_CODES.has(code)) {
    const n = Number(code);
    const [lo, hi] = codeIsUpperBound ? [n - 5, n - 1] : [n, n + 4];
    return ko ? `${lo}~${hi}세` : `${lo}–${hi}`;
  }
  return code;
}


export const WJ = '⁠'; // WORD JOINER(폭 0)
export const NBSP = ' ';
const WS = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
if (WS.size !== 25) throw new Error('White_Space 표는 25자여야 한다');

const isWs = (c) => WS.has(c.codePointAt(0));
const isHangul = (c) => {
  const u = c.codePointAt(0);
  return (u >= 0xac00 && u <= 0xd7a3) || (u >= 0x1100 && u <= 0x11ff) || (u >= 0x3130 && u <= 0x318f);
};
const isConjoining = (c) => {
  const u = c.codePointAt(0);
  return u >= 0x1100 && u <= 0x11ff;
};
const isAsciiDigit = (c) => c >= '0' && c <= '9';

export function koKeepWords(s) {
  if (typeof s !== 'string') fail('s');
  const cs = Array.from(s);
  for (let i = 0; i < cs.length; i += 1) {
    if (cs[i] !== ' ') continue;
    const prev2 = cs.slice(Math.max(0, i - 2), i).join('');
    const next2 = cs.slice(i + 1, i + 3).join('');
    if ((prev2 === '까지' && next2 === '직선') || (prev2 === '직선' && i + 1 < cs.length && isAsciiDigit(cs[i + 1]))) cs[i] = NBSP;
  }
  const out = []; // ②
  for (let i = 0; i < cs.length; i += 1) {
    out.push(cs[i]);
    if (cs[i] === ',' && i > 0 && i < cs.length - 1 && isAsciiDigit(cs[i - 1]) && isAsciiDigit(cs[i + 1])) out.push(WJ);
  }
  if (out.length < 2) return out.join('');
  const res = [out[0]]; // ③
  for (let i = 1; i < out.length; i += 1) {
    const a = out[i - 1];
    const b = out[i];
    if (!isWs(a) && !isWs(b) && a !== WJ && b !== WJ && (isHangul(a) || isHangul(b)) && !(isConjoining(a) && isConjoining(b))) res.push(WJ);
    res.push(b);
  }
  return res.join('');
}


export function withParams(params) {
  if (params === null || typeof params !== 'object') throw new TypeError('params 객체가 필요하다');
  const R = int(params.earthRadiusM, 'params.earthRadiusM');
  const topNDefault = int(params.jikjuHomeShareTopNDefault, 'params.jikjuHomeShareTopNDefault');
  const minClusterDefault = int(params.jikjuShuttleMinCluster, 'params.jikjuShuttleMinCluster');
  const upper = params.jikjuAgeBandCodeIsUpperBound;
  if (typeof upper !== 'boolean') throw new TypeError('params.jikjuAgeBandCodeIsUpperBound 는 불리언');
  return Object.freeze({
    roundDiv,
    isKorean,
    haversineM: (lat1, lng1, lat2, lng2) => haversineM(lat1, lng1, lat2, lng2, R),
    affordable,
    homeShareRank: (cells, ageBand, sex, topN) => homeShareRank(cells, ageBand, sex, topN === undefined ? topNDefault : topN),
    compareRegions,
    shuttleCandidates: (rows, topN, minCluster) => shuttleCandidates(rows, topN, minCluster === undefined || minCluster === null ? minClusterDefault : minCluster),
    excludeFlaggedHomes,
    jikjuFilePath,
    jikjuHomeAllowed,
    drtCandidates,
    ageBandLabel: (code, lang) => ageBandLabel(code, lang, upper),
    koKeepWords,
  });
}
