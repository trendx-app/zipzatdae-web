import { CONFIG, resolveSource } from '../config.js';
import { validateParams } from '../core/params.js';
import { withParams, jikjuFilePath } from '../core/jikju.js';
import { JikjuStore } from '../core/storage.js';
import { applyI18n, t } from './i18n.js';
import { byId, h, keepQueryLinks, status } from './ui.js';
import { ym, buildStamp, stamp } from './fmt.js';

async function loadParamsFromCandidates(urls) {
  let last = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'no-cache' });
      if (!res.ok) { last = `${u} ${res.status}`; continue; }
      return validateParams(await res.json());
    } catch (e) {
      last = `${u} ${e.message}`;
    }
  }
  throw new Error(`params.json 을 못 읽었다: ${last}`);
}

export async function boot({ nav = null } = {}) {
  applyI18n(document);
  keepQueryLinks(document);
  if (nav) for (const a of document.querySelectorAll(`nav a[data-nav="${nav}"]`)) a.setAttribute('aria-current', 'page');
  const src = resolveSource(location.search);
  const params = await loadParamsFromCandidates(CONFIG.PARAMS_URLS);
  const J = withParams(params);
  const store = new JikjuStore({
    urlFor: src.urlFor, filePath: jikjuFilePath, pointerPath: CONFIG.POINTER_PATH, knownFormats: [...CONFIG.KNOWN_FORMATS], pointerTtlMs: CONFIG.POINTER_TTL_MS,
  });
  const p = await store.pointer();
  const gen = store.generation();
  const meta = p.ok ? pointerMeta(gen) : null;
  const srcBadge = document.getElementById('source-badge');
  if (srcBadge && src.mode === 'snapshot') srcBadge.textContent = t('web_dev_source_format', src.base);
  return { src, params, J, store, pointerOk: p.ok, pointerReason: p.reason, meta };
}

export function pointerMeta(gen) {
  const ptr = gen.pointer || {};
  return {
    buildId: gen.build.buildId,
    flowBasis: ptr.flow_basis ?? null,
    workplaceBasis: ptr.workplace_basis ?? null,
    transitBasis: ptr.transit_basis ?? null,
    activatedAt: ptr.activated_at ?? null,
    files: gen.files,
  };
}

export function basisLine(meta, snapBasis) {
  if (!meta) return '';
  const flow = ym(meta.flowBasis);
  const wp = ym(meta.workplaceBasis);
  if (snapBasis && snapBasis.basisYm) return t('web_basis_line_format', flow, wp, ym(snapBasis.basisYm), snapBasis.builtAt ? stamp(snapBasis.builtAt) : buildStamp(snapBasis.buildId ?? meta.buildId));
  return `${t('web_basis_flow_only_format', flow, wp)} · ${t('web_snapshot_none')}`;
}

export function showLoadError(containerId, onRetry) {
  const c = byId(containerId);
  c.replaceChildren(status('error', t('jikju_load_error'), { onRetry, retryLabel: t('web_retry') }));
}

export function loadingLine() {
  return status('loading', t('web_loading'));
}

export function setBasis(text) {
  const el = document.getElementById('basis-line');
  if (el) el.replaceChildren(h('span', null, text));
}
