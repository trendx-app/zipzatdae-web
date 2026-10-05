import { JIKJU_PUBLIC_PATH } from './core/jikju.js';

export function paramsUrl(moduleUrl) {
  const repoLayout = /\/web\/config\.js$/.test(new URL(moduleUrl).pathname);
  return new URL(repoLayout ? '../core-spec/params.json' : 'params.json', moduleUrl).href;
}

export const CONFIG = Object.freeze({
  SUPABASE_URL: 'https://kgueaxstmhysfayvsyzs.supabase.co',
  POINTER_PATH: 'jikju/current.json',
  KNOWN_FORMATS: Object.freeze([1]),
  POINTER_TTL_MS: 30 * 60 * 1000,
  PARAMS_URLS: Object.freeze([paramsUrl(import.meta.url)]),
  SNAPSHOT_QUERY: 'snapshot',
});

export function productionUrlFor(path) {
  return `${CONFIG.SUPABASE_URL}${JIKJU_PUBLIC_PATH}${path.split('/').map((s) => encodeURIComponent(s)).join('/')}`;
}

export function snapshotUrlFor(base) {
  const b = base.endsWith('/') ? base : `${base}/`;
  return (path) => `${b}${path}`;
}

export function resolveSource(search) {
  const q = new URLSearchParams(search ?? '');
  const snap = q.get(CONFIG.SNAPSHOT_QUERY);
  if (snap && /^(https?:\/\/|\.{0,2}\/|[A-Za-z0-9_.-])/.test(snap) && !/^javascript:/i.test(snap)) {
    return { mode: 'snapshot', urlFor: snapshotUrlFor(snap), base: snap };
  }
  return { mode: 'production', urlFor: productionUrlFor, base: CONFIG.SUPABASE_URL };
}
