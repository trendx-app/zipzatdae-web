import { startPage, loadSnapshot, firstWork, snapshotFor } from '../app/page.js';
import { workPicker, rememberWork, setWorkQuery } from '../app/shell.js';
import { t } from '../app/i18n.js';
import { h, add, clear, byId, status, sectionHead } from '../app/ui.js';
import { num, pct, dist, ymd } from '../app/fmt.js';
import * as D from '../app/data.js';
import * as V from '../app/views.js';

const ctx = await startPage({ base: '../', nav: 'gap' });
if (ctx) await main(ctx);

function day(s) {
  return typeof s === 'string' ? ymd(s.replace(/-/g, '')) : '—';
}

async function main(ctx) {
  const { J, params } = ctx;
  await loadSnapshot(ctx);
  const S = { gap: byId('sec-gap'), list: byId('sec-list'), work: byId('sec-work'), drt: byId('sec-drt') };
  let gapDoc;
  try {
    gapDoc = await ctx.file('transit_gap');
  } catch {
    S.gap.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return;
  }
  if (gapDoc === null) {
    S.gap.replaceChildren(status('empty', t('jikju_load_error')));
    return;
  }
  const tb = (ctx.meta && ctx.meta.transitBasis) || gapDoc.transit_basis || {};
  const basis = t('jikju_drt_basis_format', day(tb.rail), day(tb.bus));
  const state = { home: null, work: null, flowDoc: null };
  const nm = (code) => V.label(code, { regionIdx: ctx.regionIdx, flowDoc: state.flowDoc });

  function renderGap() {
    clear(S.gap);
    const rows = V.gapTable(gapDoc);
    const thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('web_gap_col_home')),
      h('th', { scope: 'col', class: 'num' }, t('web_gap_col_complexes')),
      h('th', { scope: 'col', class: 'num' }, t('web_gap_col_rail_out')),
      h('th', { scope: 'col', class: 'num' }, t('web_gap_col_gap')),
      h('th', { scope: 'col' }, h('span', { class: 'muted' }, t('web_gap_open')))));
    const tbody = h('tbody', null, rows.map((r) => h('tr', { class: r.home === state.home ? 'is-gap' : null },
      h('th', { scope: 'row' }, nm(r.home)),
      h('td', { class: 'num' }, num(r.complexes)),
      h('td', { class: 'num' }, num(r.rail_out)),
      h('td', { class: 'num' }, num(r.gap)),
      h('td', null, ctx.store.has(`homes/${r.home}`)
        ? h('button', { type: 'button', class: 'btn-link', 'aria-pressed': r.home === state.home ? 'true' : 'false', onclick: () => pickHome(r.home) }, t('web_gap_open'))
        : null))));
    add(S.gap, 
      sectionHead(t('web_gap_title'), t('web_gap_sub')),
      h('p', { class: 'caption' }, basis),
      h('div', { class: 'table-wrap' }, h('table', null, thead, tbody)),
      h('p', { class: 'caption' }, t('web_gap_sort_caption')),
      h('p', { class: 'caption' }, t('jikju_drt_note')),
    );
  }

  async function pickHome(home) {
    state.home = home;
    renderGap();
    S.list.replaceChildren(status('loading', t('web_loading')));
    let homesDoc;
    let snapDoc;
    try {
      homesDoc = await ctx.file(`homes/${home}`);
      snapDoc = await snapshotFor(ctx, home);
    } catch {
      S.list.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => pickHome(home), retryLabel: t('web_retry') }));
      return;
    }
    if (state.home !== home) return;
    clear(S.list);
    if (homesDoc === null) return;
    const rows = V.gapComplexes({ homesDoc, snapDoc, params });
    const rail = (r) => (r.rail_m === null || r.rail_m === undefined ? t('jikju_row_rail_none') : t('jikju_row_rail_format', r.rail_name ?? '', r.rail_lines ?? '', dist(r.rail_m)));
    const bus = (r) => (r.bus_m === null || r.bus_m === undefined ? t('jikju_row_bus_none') : t('jikju_row_bus_format', dist(r.bus_m)));
    const thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('web_gap_col_complex')), h('th', { scope: 'col' }, t('web_gap_col_rail')), h('th', { scope: 'col' }, t('web_gap_col_bus'))));
    const tbody = h('tbody', null, rows.map((r) => h('tr', { class: r.isGap ? 'is-gap' : null },
      h('th', { scope: 'row' }, r.name ?? t('web_row_id_format', String(r.complex_id))),
      h('td', null, rail(r)),
      h('td', null, bus(r)))));
    add(S.list, 
      sectionHead(t('web_gap_list_title_format', nm(home))),
      ctx.snap ? null : h('p', { class: 'caption' }, t('web_snapshot_none')),
      h('div', { class: 'table-wrap' }, h('table', null, thead, tbody)),
      h('p', { class: 'caption' }, t('web_gap_list_sort_caption')),
    );
  }

  const works = ctx.works.filter((w) => ctx.store.has(`flow/work/${w.code}`));

  async function setWork(code) {
    state.work = code;
    rememberWork(code);
    setWorkQuery(code);
    S.drt.replaceChildren(status('loading', t('web_loading')));
    try {
      state.flowDoc = await ctx.file(`flow/work/${code}`);
    } catch {
      S.drt.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => setWork(code), retryLabel: t('web_retry') }));
      return;
    }
    renderDrt();
  }

  function renderDrt() {
    clear(S.drt);
    if (!state.flowDoc) return;
    const topN = params.jikjuDrtTopN;
    const m = V.drtModel({ flowDoc: state.flowDoc, gapDoc, topN, J });
    add(S.drt, 
      sectionHead(t('jikju_drt_title'), t('jikju_drt_hint_format', topN)),
      h('p', { class: 'band' }, t('jikju_drt_summary_format', nm(state.work), topN, m.rows.length)),
    );
    if (m.rows.length === 0) {
      add(S.drt, status('empty', t('jikju_drt_empty_format', topN)));
    } else {
      const ol = h('ul', { class: 'cx-list' });
      for (const r of m.rows) {
        add(ol, h('li', { class: 'cx-row' },
          h('div', { class: 'cx-head' }, h('span', { class: 'cx-name' }, nm(r.home)), h('span', null, t('jikju_drt_gap_format', num(r.gap)))),
          h('p', { class: 'cx-meta' }, `${t('jikju_drt_share_format', pct(r.shareTenths))} · ${t('jikju_drt_of_format', num(r.complexes))}`)));
      }
      add(S.drt, ol);
    }
    add(S.drt, h('p', { class: 'caption' }, basis), h('p', { class: 'caption' }, t('jikju_drt_note')));
  }

  renderGap();
  const pre = V.gapTable(gapDoc).find((r) => ctx.store.has(`homes/${r.home}`));
  if (pre) await pickHome(pre.home);
  if (works.length > 0) {
    const first = V.workRow(works, new URLSearchParams(location.search).get('work'))?.code ?? firstWork({ ...ctx, works });
    workPicker(S.work, { groups: D.groupWorks(works, params), value: first, onChange: (code) => setWork(code), regionIdx: ctx.regionIdx });
    await setWork(first);
  }
}
