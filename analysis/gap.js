import { startPage, loadSnapshot, firstWork, snapshotFor } from '../app/page.js';
import { workPicker, rememberWork, setWorkQuery } from '../app/shell.js';
import { t } from '../app/i18n.js';
import { h, add, clear, byId, status, sectionHead, chips } from '../app/ui.js';
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

  const LIST_PAGE = 50;
  const groups = V.gapGroups(gapDoc, ctx.regionIdx);
  const open = new Set();
  const list = { rows: null, filter: 'all', shown: LIST_PAGE };

  function renderGap() {
    clear(S.gap);
    const thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('web_gap_col_home')),
      h('th', { scope: 'col', class: 'num' }, t('web_gap_col_complexes')),
      h('th', { scope: 'col', class: 'num' }, t('web_gap_col_rail_out')),
      h('th', { scope: 'col', class: 'num' }, t('web_gap_col_gap'))));
    const bodies = groups.map((g) => {
      const isOpen = open.has(g.sidoCode);
      const head = h('tr', { class: 'sido-row' },
        h('th', { scope: 'row' }, h('button', {
          type: 'button', class: 'fold-btn', 'aria-expanded': isOpen ? 'true' : 'false',
          onclick: () => { if (isOpen) open.delete(g.sidoCode); else open.add(g.sidoCode); renderGap(); },
        }, g.sido)),
        h('td', { class: 'num' }, num(g.complexes)),
        h('td', { class: 'num' }, num(g.rail_out)),
        h('td', { class: 'num' }, num(g.gap)));
      const rows = isOpen ? g.rows.map((r) => h('tr', { class: r.home === state.home ? 'sgg-row is-gap' : 'sgg-row' },
        h('th', { scope: 'row' }, ctx.store.has(`homes/${r.home}`)
          ? h('button', { type: 'button', class: 'cell-btn', 'aria-pressed': r.home === state.home ? 'true' : 'false', onclick: () => (r.home === state.home ? closeHome() : pickHome(r.home, true)) }, nm(r.home))
          : nm(r.home)),
        h('td', { class: 'num' }, num(r.complexes)),
        h('td', { class: 'num' }, num(r.rail_out)),
        h('td', { class: 'num' }, num(r.gap)))) : [];
      return h('tbody', null, head, rows);
    });
    add(S.gap,
      sectionHead(t('web_gap_title'), t('web_gap_sub')),
      h('p', { class: 'caption' }, basis),
      h('div', { class: 'table-wrap' }, h('table', { class: 'gap-table wide' }, thead, bodies)),
      h('p', { class: 'caption' }, t('web_gap_fold_hint')),
      h('p', { class: 'caption' }, t('web_gap_sort_caption')),
      h('p', { class: 'caption' }, t('jikju_drt_note')),
    );
  }

  function closeHome() {
    state.home = null;
    list.rows = null;
    clear(S.list);
    renderGap();
  }

  async function pickHome(home, scroll = false) {
    state.home = home;
    list.rows = null;
    list.filter = 'all';
    list.shown = LIST_PAGE;
    open.add(home.slice(0, 2));
    renderGap();
    S.list.replaceChildren(status('loading', t('web_loading')));
    let homesDoc;
    let snapDoc;
    try {
      homesDoc = await ctx.file(`homes/${home}`);
      snapDoc = await snapshotFor(ctx, home);
    } catch {
      S.list.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => pickHome(home, scroll), retryLabel: t('web_retry') }));
      return;
    }
    if (state.home !== home) return;
    clear(S.list);
    if (homesDoc === null) return;
    list.rows = V.gapComplexes({ homesDoc, snapDoc, params });
    renderList();
    if (scroll) S.list.scrollIntoView({ block: 'start' });
  }

  function renderList() {
    clear(S.list);
    const home = state.home;
    if (!home || !list.rows) return;
    const all = list.rows;
    const rows = list.filter === 'gap' ? all.filter((r) => r.isGap) : all;
    const shown = rows.slice(0, list.shown);
    const rail = (r) => (r.rail_m === null || r.rail_m === undefined ? t('jikju_row_rail_none') : t('jikju_row_rail_format', r.rail_name ?? '', r.rail_lines ?? '', dist(r.rail_m)));
    const bus = (r) => (r.bus_m === null || r.bus_m === undefined ? t('jikju_row_bus_none') : t('jikju_row_bus_format', dist(r.bus_m)));
    const thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('web_gap_col_complex')), h('th', { scope: 'col' }, t('web_gap_col_rail')), h('th', { scope: 'col' }, t('web_gap_col_bus'))));
    const tbody = h('tbody', null, shown.map((r) => h('tr', { class: r.isGap ? 'is-gap' : null },
      h('th', { scope: 'row' }, r.name ?? t('web_row_id_format', String(r.complex_id))),
      h('td', null, rail(r)),
      h('td', null, bus(r)))));
    const filterBox = h('div', { class: 'chips' });
    chips(filterBox, [{ value: 'all', label: t('web_gap_filter_all') }, { value: 'gap', label: t('web_gap_filter_gap') }], list.filter,
      (v) => { list.filter = v; list.shown = LIST_PAGE; renderList(); }, { ariaLabel: t('web_gap_filter_label') });
    const left = rows.length - shown.length;
    add(S.list,
      sectionHead(t('web_gap_list_title_format', nm(home))),
      h('button', { type: 'button', class: 'btn-link', onclick: () => closeHome() }, t('web_gap_close')),
      ctx.snap ? null : h('p', { class: 'caption' }, t('web_snapshot_none')),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('web_gap_filter_label')), filterBox),
      h('p', { class: 'caption' }, t('web_gap_shown_format', num(rows.length), num(shown.length))),
      rows.length === 0 ? status('empty', t('web_gap_none')) : h('div', { class: 'table-wrap' }, h('table', { class: 'cx-table' }, thead, tbody)),
      left > 0 ? h('button', { type: 'button', class: 'btn', onclick: () => { list.shown += LIST_PAGE; renderList(); } }, t('web_gap_more_format', num(left))) : null,
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
  if (works.length > 0) {
    const first = V.workRow(works, new URLSearchParams(location.search).get('work'))?.code ?? firstWork({ ...ctx, works });
    workPicker(S.work, { groups: D.groupWorks(works, params), value: first, onChange: (code) => setWork(code), regionIdx: ctx.regionIdx });
    await setWork(first);
  }
}
