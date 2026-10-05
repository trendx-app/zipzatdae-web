
export const JIKJU_PARAM_SPEC = Object.freeze({
  jikjuSmallCellThreshold: 'int',
  jikjuDistanceDisplayUnitM: 'int',
  jikjuHomeShareTopNDefault: 'int',
  jikjuCommuteHomeSidos: 'string[]',
  jikjuAgeBandCodeIsUpperBound: 'bool',
  jikjuDrtTopN: 'int',
  jikjuShuttleMinCluster: 'int',
  jikjuModelEarthRadiusKm: 'number',
  jikjuModelVariant: 'string',
  jikjuModelTable: 'string',
  jikjuRailRadiusM: 'int',
  jikjuBusRadiusM: 'int',
  jikjuGapRailM: 'int',
  jikjuGapBusM: 'int',
  jikjuTransitRoundM: 'int',
  jikjuWorkplaceMinCell: 'int',
  jikjuFlowChangeMinCount: 'int',
  jikjuFlowChangeRisePerMille: 'int',
  jikjuFlowChangeHubMinPairs: 'int',
  jikjuWorkSidos: 'string[]',
  jikjuRegionSidos: 'map:string[]',
});

function typeOk(v, t) {
  switch (t) {
    case 'int':
      return typeof v === 'number' && Number.isSafeInteger(v);
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'bool':
      return typeof v === 'boolean';
    case 'string':
      return typeof v === 'string';
    case 'string[]':
      return Array.isArray(v) && v.every((x) => typeof x === 'string');
    case 'map:string[]':
      return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0
        && Object.values(v).every((a) => Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === 'string'));
    default:
      return false;
  }
}

export function validateParams(raw) {
  if (raw === null || typeof raw !== 'object') throw new TypeError('params.json: 객체가 아니다');
  const out = {};
  const bad = [];
  for (const [key, t] of Object.entries(JIKJU_PARAM_SPEC)) {
    const v = raw[key];
    if (!typeOk(v, t)) bad.push(`${key}(${t})`);
    else if (Array.isArray(v)) out[key] = Object.freeze([...v]);
    else if (t === 'map:string[]') out[key] = Object.freeze(Object.fromEntries(Object.entries(v).map(([k, a]) => [k, Object.freeze([...a])])));
    else out[key] = v;
  }
  const R = raw.comparables && raw.comparables.earthRadiusM;
  if (!typeOk(R, 'int') || R <= 0) bad.push('comparables.earthRadiusM(int > 0)');
  else out.earthRadiusM = R;
  if (bad.length > 0) throw new TypeError(`params.json 에 §21 칸이 없거나 타입이 다르다: ${bad.join(', ')}`);
  return Object.freeze(out);
}

export function repoParamsUrl() {
  return new URL('../../core-spec/params.json', import.meta.url);
}

export async function loadParams(source = {}) {
  let text;
  if (source.file !== undefined) {
    const { readFile } = await import('node:fs/promises');
    text = await readFile(source.file, 'utf8');
  } else if (source.url !== undefined) {
    const f = source.fetchImpl ?? globalThis.fetch;
    if (typeof f !== 'function') throw new TypeError('fetch 가 없다');
    const res = await f(source.url);
    if (!res.ok) throw new Error(`params.json HTTP ${res.status}`);
    text = await res.text();
  } else {
    throw new TypeError('loadParams: {url} 또는 {file} 이 필요하다');
  }
  return validateParams(JSON.parse(text));
}
