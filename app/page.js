import { boot, basisLine, setBasis } from './boot.js';
import { renderShell, initialWork } from './shell.js';
import { t } from './i18n.js';
import { byId, status } from './ui.js';
import * as D from './data.js';

export async function startPage({ base, nav, needWorks = true }) {
  renderShell({ base, nav });
  const main = byId('app');
  let b;
  try {
    b = await boot({ nav });
  } catch {
    main.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return null;
  }
  if (!b.pointerOk) {
    main.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return null;
  }
  const file = async (name) => {
    const r = await b.store.file(name);
    if (r.state === 'show') return r.doc;
    if (r.state === 'hide') return null;
    const e = new Error(r.reason);
    e.retry = true;
    throw e;
  };
  const ctx = { ...b, file, files: b.meta.files, regionIdx: new Map(), works: [], groups: [], snap: null };
  try {
    ctx.regionIdx = D.regionIndex(await file('regions'), b.params);
    if (needWorks) {
      const index = await file('flow/index');
      ctx.flowIndex = index;
      ctx.works = D.workList(index, ctx.regionIdx, b.params);
      ctx.groups = D.groupWorks(ctx.works, b.params);
    }
  } catch {
    main.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return null;
  }
  return ctx;
}

export async function loadSnapshot(ctx) {
  let snap = null;
  try {
    snap = await ctx.file('web/snapshot');
  } catch {
    snap = null;
  }
  ctx.snap = snap;
  setBasis(basisLine(ctx.meta, D.snapshotBasis(snap)));
  return snap;
}

export async function snapshotFor(ctx, home) {
  const idx = ctx.snap;
  if (!idx) return null;
  if (idx.packs) return idx;
  ctx.snapShards = ctx.snapShards || new Map();
  if (ctx.snapShards.has(home)) return ctx.snapShards.get(home);
  const name = D.snapshotShardName(idx, home);
  const doc = (name && (await ctx.file(name))) || { home, packs: [] };
  ctx.snapShards.set(home, doc);
  return doc;
}

export function firstWork(ctx) {
  return initialWork(ctx.works, location.search, (code) => ctx.store.has(`flow/work/${code}`));
}
