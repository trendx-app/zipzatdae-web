import { compareCodePoints, roundDiv } from '../core/jikju.js';
import * as D from './data.js';
import { t } from './i18n.js';

export const KINDS = Object.freeze(['all', 'apt', 'row_house', 'officetel']);
export const DEALS = Object.freeze(['trade', 'jeonse']);
export const BUDGETS = Object.freeze({
  trade: Object.freeze(Array.from({ length: 29 }, (_, i) => 20000 + i * 10000)),
  jeonse: Object.freeze(Array.from({ length: 29 }, (_, i) => 10000 + i * 5000)),
});
export function defaultBudgetIndex(deal) {
  return Math.floor((BUDGETS[deal].length * 2) / 3);
}
export const SHUTTLE_TOPN = Object.freeze([10, 20, 30]);
export const LINE_TOPN = 5;
export const MAP_LINES = 15;
const ALL = 100000;


export function nameOf(code, { regionIdx = null, flowDoc = null } = {}) {
  const r = regionIdx ? regionIdx.get(code) : null;
  if (r) return { name: r.name, legacy: Boolean(r.name_note) };
  const f = flowDoc && flowDoc.regions ? flowDoc.regions[code] : null;
  if (f && f.name) return { name: f.name, legacy: Boolean(f.name_note) };
  return { name: code, legacy: false };
}

export function label(code, ctx) {
  const n = nameOf(code, ctx);
  return n.legacy ? `${n.name} ${t('jikju_name_note_legacy')}` : n.name;
}

export function filterLabel(J, age, sex) {
  const a = age === null ? null : J.ageBandLabel(age, 'ko');
  const s = sex === null ? null : t(sex === 'M' ? 'jikju_sex_m' : 'jikju_sex_f');
  if (a === null && s === null) return t('jikju_age_all');
  if (a === null) return s;
  if (s === null) return a;
  return t('jikju_filter_label_format', a, s);
}


export function topHomes({ flowDoc, age, sex, topN, J }) {
  const cells = (flowDoc && flowDoc.cells) || [];
  const r = J.homeShareRank(cells, age, sex, topN);
  const flagged = new Set(D.flaggedHomes(flowDoc));
  return { rows: r.rows.map((x) => ({ ...x, flagged: flagged.has(x.home) })), sumCnt: r.sumCnt, partial: r.partial };
}

export function modelTop(modelDoc, work, topN = 10) {
  const rows = D.modelRows(modelDoc, work);
  if (rows === null || rows.length === 0) return null;
  const top = rows.slice(0, topN);
  const rest = rows.slice(topN);
  return { rows: top, restCount: rest.length, restTenths: rest.reduce((a, r) => a + r.shareTenths, 0) };
}

function priceOf(row, deal) {
  return deal === 'trade' ? row.tradeMedianManwon : row.jeonseMedianManwon;
}

export function complexList({ homesDoc, snapDoc, deal, kind, budgetManwon, J, workPoint = null }) {
  const base = D.homesRows(homesDoc);
  const joined = D.joinHomes(base, D.snapshotComplexes(snapDoc, homesDoc ? homesDoc.sggs : []));
  const kindRows = kind === 'all' ? joined : joined.filter((r) => r.kind === kind);
  const rows = kindRows.map((r) => {
    const price = priceOf(r, deal);
    const verdict = price === null ? null : J.affordable(budgetManwon, price);
    const distToWorkM = workPoint && r.lat !== null && r.lng !== null ? J.haversineM(workPoint.lat, workPoint.lng, r.lat, r.lng) : null;
    return {
      ...r,
      price,
      ym: deal === 'trade' ? r.tradeYm : r.jeonseYm,
      count12m: deal === 'trade' ? r.tradeCount12m : r.jeonseCount12m,
      verdict,
      distToWorkM,
    };
  });
  rows.sort((a, b) => {
    const s = compareCodePoints(String(a.src_sgg ?? ''), String(b.src_sgg ?? ''));
    if (s !== 0) return s;
    if ((a.price === null) !== (b.price === null)) return a.price === null ? 1 : -1;
    if (a.price !== null && a.price !== b.price) return a.price - b.price;
    return Number(a.complex_id) - Number(b.complex_id);
  });
  const priced = rows.filter((r) => r.verdict !== null).length;
  const affordableCount = rows.filter((r) => r.verdict !== null && r.verdict.pass).length;
  return { rows, total: joined.length, kindTotal: kindRows.length, priced, affordableCount };
}

export function pointOf(code, regionIdx) {
  const r = regionIdx ? regionIdx.get(code) : null;
  return r && r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null;
}

export function compareModel({ picked, work, regionIdx, flowDoc, shareMap, summaryDoc, snapDoc, J }) {
  if (!picked || picked.length === 0) return null;
  const wp = pointOf(work, regionIdx);
  const input = picked.map((code) => {
    const hp = pointOf(code, regionIdx);
    const ws = D.workplaceRow(summaryDoc, code);
    const rs = D.snapshotRegion(snapDoc, code);
    return {
      code,
      distanceM: wp && hp ? J.haversineM(wp.lat, wp.lng, hp.lat, hp.lng) : null,
      shareTenths: shareMap.has(code) ? shareMap.get(code) : null,
      workplaces: ws && Number.isInteger(ws.workplaces) ? ws.workplaces : null,
      members: ws && Number.isInteger(ws.members) ? ws.members : null,
      tradeMedianManwon: rs && Number.isInteger(rs.p32_trade_manwon) ? rs.p32_trade_manwon : null,
      jeonseMedianManwon: rs && Number.isInteger(rs.p32_jeonse_manwon) ? rs.p32_jeonse_manwon : null,
      ratioTenths: rs && Number.isInteger(rs.jeonse_ratio_tenths) ? rs.jeonse_ratio_tenths : null,
    };
  });
  const best = J.compareRegions(input);
  const cols = picked.map((code) => ({ code, label: label(code, { regionIdx, flowDoc }) }));
  return { cols, input, best };
}


export function flowSummary({ flowDoc, age, sex, work, regionIdx, J }) {
  const all = J.homeShareRank((flowDoc && flowDoc.cells) || [], age, sex, ALL).rows;
  return D.summaryCells(all, work, regionIdx ?? new Map());
}

export function mapGeometry({ rows, work, regionIdx, w = 1000, h = 700, pad = 40 }) {
  const wp = pointOf(work, regionIdx);
  const pts = rows.map((r) => ({ r, p: pointOf(r.home, regionIdx) })).filter((x) => x.p !== null);
  const all = [...pts.map((x) => x.p), ...(wp ? [wp] : [])];
  if (all.length === 0) return { w, h, work: null, lines: [] };
  const lat0 = all.reduce((a, p) => a + p.lat, 0) / all.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = all.map((p) => p.lng * k);
  const ys = all.map((p) => p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const s = Math.min((w - 2 * pad) / span, (h - 2 * pad) / span);
  const proj = (p) => ({ x: Math.round(pad + (p.lng * k - minX) * s), y: Math.round(h - pad - (p.lat - minY) * s) });
  return {
    w,
    h,
    work: wp ? proj(wp) : null,
    lines: pts.map(({ r, p }) => ({ home: r.home, shareTenths: r.shareTenths, ...proj(p) })),
  };
}

export function ageTableModel({ flowDoc, sex, J }) {
  const bands = (flowDoc && flowDoc.age_bands) || [];
  const cells = (flowDoc && flowDoc.cells) || [];
  return D.ageTable(cells, sex, bands, J);
}

export function flowCsv({ flowDoc, regionIdx, J }) {
  const cells = (flowDoc && flowDoc.cells) || [];
  const header = [t('web_csv_col_home'), t('web_csv_col_home_name'), t('web_csv_col_age'), t('web_csv_col_age_label'), t('web_csv_col_sex'), t('web_csv_col_cnt')];
  const lines = cells.map((c) => [
    c.home,
    label(c.home, { regionIdx, flowDoc }),
    c.ageBand,
    J.ageBandLabel(c.ageBand, 'ko'),
    c.sex === 'M' ? t('jikju_sex_m') : c.sex === 'F' ? t('jikju_sex_f') : c.sex,
    c.cnt === null || c.cnt === undefined ? '' : c.cnt,
  ]);
  return { header, lines };
}


export function gapTable(gapDoc) {
  const m = D.gapMap(gapDoc);
  return Object.keys(m)
    .sort(compareCodePoints)
    .map((home) => ({ home, ...m[home] }));
}

export function gapGroups(gapDoc, regionIdx = null) {
  const out = [];
  for (const r of gapTable(gapDoc)) {
    const sidoCode = r.home.slice(0, 2);
    let g = out.length ? out[out.length - 1] : null;
    if (!g || g.sidoCode !== sidoCode) {
      g = { sidoCode, sido: null, rows: [], complexes: 0, rail_out: 0, gap: 0 };
      out.push(g);
    }
    const reg = regionIdx ? regionIdx.get(r.home) : null;
    if (g.sido === null && reg && reg.sido) g.sido = reg.sido;
    g.rows.push(r);
    for (const k of ['complexes', 'rail_out', 'gap']) g[k] = g[k] === null || r[k] === null ? null : g[k] + r[k];
  }
  for (const g of out) if (g.sido === null) g.sido = g.sidoCode;
  return out;
}

export function isGapComplex(row, params) {
  const railOut = row.rail_m === null || row.rail_m > params.jikjuGapRailM;
  const busOut = row.bus_m === null || row.bus_m > params.jikjuGapBusM;
  return railOut && busOut;
}

export function gapComplexes({ homesDoc, snapDoc, params }) {
  const rows = D.joinHomes(D.homesRows(homesDoc), D.snapshotComplexes(snapDoc, homesDoc ? homesDoc.sggs : []));
  rows.sort((a, b) => compareCodePoints(String(a.src_sgg ?? ''), String(b.src_sgg ?? '')) || Number(a.complex_id) - Number(b.complex_id));
  return rows.map((r) => ({ ...r, isGap: isGapComplex(r, params) }));
}

export function drtModel({ flowDoc, gapDoc, topN, J }) {
  const share = J.homeShareRank((flowDoc && flowDoc.cells) || [], null, null, topN).rows;
  return J.drtCandidates(share, D.gapMap(gapDoc), topN);
}


export function shuttleModel({ wpDocs, topN, J }) {
  const rows = wpDocs.flatMap((d) => D.shuttleRows(d));
  return J.shuttleCandidates(rows, topN);
}

export function lineCandidates({ clusterSgg, flowDoc, modelDoc, regionIdx, J, topN = LINE_TOPN }) {
  const all = J.homeShareRank((flowDoc && flowDoc.cells) || [], null, null, ALL).rows;
  const { rows, excluded } = J.excludeFlaggedHomes(all, D.flaggedHomes(flowDoc));
  const model = D.modelRows(modelDoc, clusterSgg);
  const modelMap = model ? new Map(model.map((m) => [m.home, m.shareTenths])) : null;
  const wp = pointOf(clusterSgg, regionIdx);
  const out = rows
    .filter((r) => r.home !== clusterSgg)
    .slice(0, topN)
    .map((r) => {
      const hp = pointOf(r.home, regionIdx);
      return {
        ...r,
        modelTenths: modelMap ? (modelMap.has(r.home) ? modelMap.get(r.home) : null) : null,
        distanceM: wp && hp ? J.haversineM(wp.lat, wp.lng, hp.lat, hp.lng) : null,
      };
    });
  return { rows: out, excluded, hasModel: modelMap !== null };
}


function byPair(a, b) {
  return compareCodePoints(a.home, b.home) || compareCodePoints(a.work, b.work);
}

export function flowChangeModel(doc) {
  if (!doc) return null;
  const up = [...(doc.up || [])].sort(byPair);
  const down = [...(doc.down || [])].sort(byPair);
  const hubs = [...(doc.hubs || [])].sort((a, b) => compareCodePoints(a.work, b.work));
  return {
    up,
    down,
    hubs,
    periods: doc.periods || null,
    days: doc.days || null,
    reproduced: doc.reproduced || null,
    overallPerMille: Number.isInteger(doc.overallPerMille) ? doc.overallPerMille : null,
    thresholds: doc.thresholds || null,
  };
}

export function daysLabel(days) {
  if (!Array.isArray(days) || days.length === 0) return '—';
  const s = [...days].sort();
  const a = s[0];
  const b = s[s.length - 1];
  const m = /^(\d{4})(\d{2})(\d{2})$/;
  const ma = a.match(m);
  const mb = b.match(m);
  if (!ma || !mb) return `${a}~${b}`;
  if (a === b) return `${ma[1]}.${ma[2]}.${ma[3]}`;
  if (ma[1] === mb[1] && ma[2] === mb[2]) return `${ma[1]}.${ma[2]}.${ma[3]}~${mb[3]}`;
  return `${ma[1]}.${ma[2]}.${ma[3]}~${mb[1]}.${mb[2]}.${mb[3]}`;
}

export function signedPct(perMille) {
  if (perMille === null || perMille === undefined) return '—';
  const sign = perMille > 0 ? '+' : perMille < 0 ? '-' : '';
  const a = Math.abs(perMille);
  return `${sign}${Math.floor(a / 10)}.${a % 10}%`;
}

export function workRow(works, code) {
  return works.find((w) => w.code === code) ?? null;
}

export function sumTenths(rows) {
  return rows.reduce((a, r) => a + (r.shareTenths ?? 0), 0);
}

export function workplaceNamesForSido(files, sido2) {
  return Object.keys(files || {})
    .filter((n) => n.startsWith(`workplace/sgg/${sido2}`))
    .sort(compareCodePoints);
}

export function latestFlowChangeName(files) {
  const names = Object.keys(files || {}).filter((n) => n.startsWith('flowchange/oa22300/')).sort(compareCodePoints);
  return names.length ? names[names.length - 1] : null;
}

export function shareOf(cnt, sum) {
  return sum > 0 ? roundDiv(cnt * 1000, sum) : 0;
}
