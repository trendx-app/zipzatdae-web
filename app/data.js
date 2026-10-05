import { compareCodePoints } from '../core/jikju.js';


export function regionOfSido(sido2, params) {
  for (const [key, sidos] of Object.entries(params.jikjuRegionSidos)) if (sidos.includes(sido2)) return key;
  return null;
}

export function regionLabelKey(region) {
  return region ? `web_region_${region}` : 'web_region_other';
}

export function regionIndex(doc, params) {
  const out = new Map();
  for (const r of (doc && doc.rows) || []) {
    if (typeof r.code !== 'string') continue;
    out.set(r.code, {
      code: r.code,
      name: r.name ?? r.code,
      name_note: r.name_note ?? null,
      sido: r.sido ?? null,
      sidoCode: r.code.slice(0, 2),
      region: r.region ?? regionOfSido(r.code.slice(0, 2), params),
      lat: typeof r.lat === 'number' ? r.lat : null,
      lng: typeof r.lng === 'number' ? r.lng : null,
      currentCodes: Array.isArray(r.current_codes) ? r.current_codes : null,
    });
  }
  return out;
}


export function workList(indexDoc, regions, params) {
  const works = ((indexDoc && indexDoc.works) || []).filter((w) => typeof w.code === 'string');
  const out = works.map((w) => {
    const r = regions.get(w.code);
    const sidoCode = w.code.slice(0, 2);
    return {
      code: w.code,
      name: w.name ?? (r ? r.name : w.code),
      sido: w.sido_name ?? (r ? r.sido : null) ?? w.sido ?? sidoCode,
      sidoCode,
      region: w.region ?? (r ? r.region : null) ?? regionOfSido(sidoCode, params),
      totalCnt: w.total_cnt ?? null,
      keptCnt: w.kept_cnt ?? null,
      excludedRatioTenths: w.excluded_ratio_tenths ?? null,
      allowed: Array.isArray(w.allowed) ? w.allowed : (indexDoc.allowed && Array.isArray(indexDoc.allowed[w.code]) ? indexDoc.allowed[w.code] : null),
    };
  });
  out.sort((a, b) => compareCodePoints(a.code, b.code));
  return out;
}

export function groupWorks(works, params) {
  const order = [...Object.keys(params.jikjuRegionSidos), null];
  const byRegion = new Map(order.map((k) => [k, new Map()]));
  for (const w of works) {
    const key = byRegion.has(w.region) ? w.region : null;
    const sidos = byRegion.get(key);
    if (!sidos.has(w.sidoCode)) sidos.set(w.sidoCode, { sidoCode: w.sidoCode, sido: w.sido, works: [] });
    sidos.get(w.sidoCode).works.push(w);
  }
  return order
    .map((region) => ({ region, sidos: [...byRegion.get(region).values()].sort((a, b) => compareCodePoints(a.sidoCode, b.sidoCode)) }))
    .filter((g) => g.sidos.length > 0);
}


export function flaggedHomes(flowDoc) {
  const f = flowDoc && flowDoc.flags && Array.isArray(flowDoc.flags.bigger_than_expected) ? flowDoc.flags.bigger_than_expected : [];
  return f.map((x) => x.home).filter((h) => typeof h === 'string');
}

export function scopeOf(flowDoc) {
  const s = (flowDoc && flowDoc.scope) || {};
  return { totalCnt: s.total_cnt ?? null, excludedCnt: s.excluded_cnt ?? null, excludedRatioTenths: s.excluded_ratio_tenths ?? null };
}

export function flowRegionName(flowDoc, code) {
  const r = flowDoc && flowDoc.regions && flowDoc.regions[code];
  return r && r.name ? r.name : code;
}


export function modelRows(modelDoc, work) {
  if (!modelDoc || !modelDoc.works || !Object.hasOwn(modelDoc.works, work)) return null;
  const entry = modelDoc.works[work];
  const raw = Array.isArray(entry) ? entry : entry && Array.isArray(entry.rows) ? entry.rows : null;
  if (!raw) return null;
  const rows = raw
    .filter((x) => x && typeof x.home === 'string' && Number.isInteger(x.pTenths))
    .map((x) => ({ home: x.home, shareTenths: x.pTenths }));
  rows.sort((a, b) => (a.shareTenths !== b.shareTenths ? b.shareTenths - a.shareTenths : compareCodePoints(a.home, b.home)));
  return rows;
}


export function snapshotComplexes(snapDoc, sggs) {
  const out = new Map();
  if (!snapDoc || !snapDoc.packs) return out;
  const want = new Set(sggs || []);
  const packs = Array.isArray(snapDoc.packs)
    ? snapDoc.packs
    : Object.entries(snapDoc.packs).map(([sgg, p]) => ({ ...p, sgg_code: p.sgg_code ?? sgg }));
  for (const pack of packs) {
    if (!pack || !want.has(pack.sgg_code) || !Array.isArray(pack.cols) || !Array.isArray(pack.rows)) continue;
    const idx = pack.cols.map((c, i) => [c, i]);
    for (const row of pack.rows) {
      const o = { property_kind: pack.property_kind ?? null, src_sgg: pack.sgg_code };
      for (const [c, i] of idx) o[c] = row[i] === undefined ? null : row[i];
      if (o.complex_id === null || o.complex_id === undefined) continue;
      out.set(complexKey(o.property_kind, o.complex_id), o);
    }
  }
  return out;
}

export function complexKey(kind, complexId) {
  return `${kind ?? '*'}:${complexId}`;
}

export function snapshotRegion(snapDoc, sgg) {
  const rows = snapDoc && snapDoc.region_summary && Array.isArray(snapDoc.region_summary.rows) ? snapDoc.region_summary.rows : [];
  return rows.find((r) => r.sgg_code === sgg) ?? null;
}

export function snapshotBasis(snapDoc) {
  if (!snapDoc) return null;
  return { basisYm: snapDoc.basis_ym ?? null, builtAt: snapDoc.src_built_at ?? snapDoc.generated_at ?? null, buildId: snapDoc.build_id ?? null };
}


export function homesRows(doc) {
  if (!doc || !Array.isArray(doc.cols) || !Array.isArray(doc.rows)) return [];
  return doc.rows.map((row) => Object.fromEntries(doc.cols.map((c, i) => [c, row[i] === undefined ? null : row[i]])));
}

export function joinHomes(rows, complexes) {
  return rows.map((r) => {
    const c = complexes.get(complexKey(r.kind, r.complex_id)) || complexes.get(complexKey(null, r.complex_id)) || null;
    const v = (k) => (c && c[k] !== undefined ? c[k] : null);
    return {
      ...r,
      inSnapshot: c !== null,
      name: v('complex_name') ?? v('name'),
      lat: v('lat'),
      lng: v('lng'),
      builtYear: v('built_year'),
      areaHundredths: v('rep_m2_hundredths'),
      tradeMedianManwon: v('trade_median_manwon'),
      jeonseMedianManwon: v('jeonse_median_manwon'),
      tradeYm: v('trade_ym'),
      jeonseYm: v('jeonse_ym'),
      tradeCount12m: v('trade_count_12m'),
      jeonseCount12m: v('jeonse_count_12m'),
    };
  });
}


export function gapMap(doc) {
  const m = (doc && (doc.homes || doc.sgg)) || {};
  const out = {};
  for (const [k, v] of Object.entries(m)) if (v && typeof v === 'object') out[k] = { complexes: v.complexes ?? null, rail_out: v.rail_out ?? null, gap: v.gap ?? null };
  return out;
}


export function shuttleRows(wpDoc) {
  const sgg = wpDoc && wpDoc.sgg_code;
  return ((wpDoc && wpDoc.emd) || []).map((e) => {
    const sb = e.size_bands || {};
    const a = sb['100-499'];
    const b = sb['500+'];
    const big = a === undefined && b === undefined ? null : (a ?? 0) + (b ?? 0);
    return { sgg, dongCode: e.dong_code, emdName: e.emd_name ?? null, members: e.members ?? null, workplaces: e.workplaces ?? null, big };
  });
}

export function workplaceRow(summaryDoc, sgg) {
  const rows = (summaryDoc && summaryDoc.rows) || [];
  return rows.find((r) => r.sgg_code === sgg) ?? null;
}


export function summaryCells(rows, work, regions) {
  const w = regions.get(work);
  const workSido = work.slice(0, 2);
  let same = 0;
  let sameSido = 0;
  const other = new Map();
  for (const r of rows) {
    if (r.home === work) same += r.shareTenths;
    else if (r.home.slice(0, 2) === workSido) sameSido += r.shareTenths;
    else {
      const sido = r.home.slice(0, 2);
      const name = (regions.get(r.home) && regions.get(r.home).sido) || sido;
      other.set(sido, { sido, name, tenths: (other.get(sido)?.tenths ?? 0) + r.shareTenths });
    }
  }
  return { same, sameSido, workSidoName: w ? w.sido : workSido, others: [...other.values()].sort((a, b) => compareCodePoints(a.sido, b.sido)) };
}

export function ageTable(cells, sex, ageBands, J) {
  const homes = [...new Set(cells.map((c) => c.home))].sort(compareCodePoints);
  const cols = ageBands.map((a) => {
    const r = J.homeShareRank(cells, a, sex ?? null, 100000);
    const byHome = new Map(r.rows.map((x) => [x.home, x.shareTenths]));
    const nullHomes = new Set(cells.filter((c) => c.ageBand === a && (sex === null || sex === undefined || c.sex === sex) && c.cnt === null).map((c) => c.home));
    return { ageBand: a, sumCnt: r.sumCnt, values: homes.map((h) => (nullHomes.has(h) ? null : byHome.get(h) ?? 0)) };
  });
  return { homes, cols };
}
