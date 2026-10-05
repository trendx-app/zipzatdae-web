import { startPage, loadSnapshot, firstWork } from '../app/page.js';
import { workPicker, rememberWork, setWorkQuery } from '../app/shell.js';
import { t } from '../app/i18n.js';
import { h, add, clear, byId, chips, status, sectionHead } from '../app/ui.js';
import { num, pct, dist } from '../app/fmt.js';
import * as D from '../app/data.js';
import * as V from '../app/views.js';

const ctx = await startPage({ base: '../', nav: 'shuttle' });
if (ctx) await main(ctx);

async function main(ctx) {
  const { J, params } = ctx;
  await loadSnapshot(ctx);
  let modelDoc = null;
  try {
    modelDoc = await ctx.file('model_g');
  } catch {
    modelDoc = null;
  }
  const S = { work: byId('sec-work'), top: byId('sec-top'), cluster: byId('sec-cluster'), line: byId('sec-line') };
  const works = ctx.works.filter((w) => V.workplaceNamesForSido(ctx.files, w.sidoCode).length > 0);
  if (works.length === 0) {
    S.work.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return;
  }
  const state = { work: null, topN: V.SHUTTLE_TOPN[0], wpDocs: [], cluster: null, sggNames: new Map() };
  const sggName = (code) => {
    const n = V.nameOf(code, { regionIdx: ctx.regionIdx });
    if (n.name !== code) return n.legacy ? `${n.name} ${t('jikju_name_note_legacy')}` : n.name;
    return state.sggNames.get(code) ?? code;
  };
  const sidoName = () => {
    const w = V.workRow(ctx.works, state.work);
    return (w && w.sido) || state.work.slice(0, 2);
  };

  async function setWork(code) {
    state.work = code;
    state.cluster = null;
    rememberWork(code);
    setWorkQuery(code);
    S.top.replaceChildren(status('loading', t('web_loading')));
    clear(S.cluster);
    clear(S.line);
    const names = V.workplaceNamesForSido(ctx.files, code.slice(0, 2));
    try {
      state.wpDocs = (await Promise.all(names.map((n) => ctx.file(n)))).filter((d) => d !== null);
    } catch {
      S.top.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => setWork(code), retryLabel: t('web_retry') }));
      return;
    }
    state.sggNames = new Map(state.wpDocs.filter((d) => d.sgg_code && d.sgg_name).map((d) => [d.sgg_code, d.sgg_name]));
    render();
  }

  function render() {
    renderTop();
    renderClusters();
    renderLine();
  }

  function model() {
    return V.shuttleModel({ wpDocs: state.wpDocs, topN: state.topN, J });
  }

  function renderTop() {
    clear(S.top);
    const m = model();
    const box = h('div', { class: 'chips' });
    chips(box, V.SHUTTLE_TOPN.map((n) => ({ value: n, label: t('jikju_sh_topn_format', n) })), state.topN, (v) => { state.topN = v; state.cluster = null; render(); }, { ariaLabel: t('jikju_sh_topn_title') });
    const allDongs = state.wpDocs.reduce((a, d) => a + ((d.emd && d.emd.length) || 0), 0);
    add(S.top, 
      sectionHead(t('jikju_tab_shuttle'), t('jikju_sh_sub')),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_sh_topn_title')), box),
      h('p', { class: 'band' }, t('jikju_sh_summary_format', sidoName(), num(m.totalMembers), pct(m.coverageTenths), m.top.length)),
      h('p', { class: 'caption' }, t('jikju_sh_total_dongs_format', num(allDongs))),
      h('h3', null, t('jikju_sh_top_title_format', m.top.length)),
      h('p', { class: 'caption' }, t('jikju_sh_top_hint')),
    );
    const thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('jikju_sh_col_dong')),
      h('th', { scope: 'col', class: 'num' }, t('jikju_sh_col_members')),
      h('th', { scope: 'col', class: 'num' }, t('jikju_sh_col_workplaces')),
      h('th', { scope: 'col', class: 'num' }, t('jikju_sh_col_big'))));
    const none = () => h('span', { 'aria-label': t('jikju_value_none_a11y') }, t('jikju_value_none'));
    const tbody = h('tbody', null, m.top.map((r) => h('tr', null,
      h('th', { scope: 'row' }, `${sggName(r.sgg)} ${r.emdName ?? r.dongCode}`),
      h('td', { class: 'num' }, num(r.members)),
      h('td', { class: 'num' }, r.workplaces === null ? none() : num(r.workplaces)),
      h('td', { class: 'num' }, r.big === null ? none() : num(r.big)))));
    add(S.top, h('div', { class: 'table-wrap' }, h('table', null, thead, tbody)), h('p', { class: 'caption' }, t('web_people_unit')));
  }

  function renderClusters() {
    clear(S.cluster);
    const m = model();
    add(S.cluster, sectionHead(t('jikju_sh_cluster_title_format', m.clusters.length), t('web_sh_cluster_hint')));
    if (m.clusters.length === 0) {
      add(S.cluster, status('empty', t('jikju_sh_cluster_empty_format', state.topN)));
      return;
    }
    if (state.cluster === null || !m.clusters.some((c) => c.sgg === state.cluster)) state.cluster = m.clusters[0].sgg;
    const box = h('div', { class: 'chips', role: 'group', 'aria-label': t('jikju_sh_cluster_title_format', m.clusters.length) });
    for (const c of m.clusters) {
      const on = c.sgg === state.cluster;
      add(box, h('button', {
        type: 'button', class: `chip${on ? ' is-on' : ''}`, 'aria-pressed': on ? 'true' : 'false',
        onclick: () => { state.cluster = c.sgg; renderClusters(); renderLine(); },
      }, `${sggName(c.sgg)} · ${t('jikju_sh_cluster_dongs_format', c.dongCodes.length)} · ${t('jikju_people_count_format', num(c.members))}`));
    }
    add(S.cluster, box, h('p', { class: 'caption' }, t('jikju_sh_adjacent_note')));
  }

  async function renderLine() {
    clear(S.line);
    const sgg = state.cluster;
    if (!sgg || !ctx.store.has(`flow/work/${sgg}`)) return; // 그 시군구 흐름 파일이 이 빌드에 없으면 섹션을 비운다
    let flowDoc;
    try {
      flowDoc = await ctx.file(`flow/work/${sgg}`);
    } catch {
      S.line.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => renderLine(), retryLabel: t('web_retry') }));
      return;
    }
    if (state.cluster !== sgg || flowDoc === null) return;
    const lc = V.lineCandidates({ clusterSgg: sgg, flowDoc, modelDoc, regionIdx: ctx.regionIdx, J });
    const nm = (code) => V.label(code, { regionIdx: ctx.regionIdx, flowDoc });
    const none = () => h('span', { 'aria-label': t('jikju_value_none_a11y') }, t('jikju_value_none'));
    const heads = [
      h('th', { scope: 'col' }, t('web_sh_col_home')),
      h('th', { scope: 'col', class: 'num' }, t('web_sh_col_cnt')),
      h('th', { scope: 'col', class: 'num' }, t('web_sh_col_dist')),
      h('th', { scope: 'col', class: 'num' }, t('jikju_measured_share_label')),
      lc.hasModel ? h('th', { scope: 'col', class: 'num model-col' }, t('jikju_model_share_label')) : null,
    ];
    const tbody = h('tbody', null, lc.rows.map((r) => h('tr', null,
      h('th', { scope: 'row' }, nm(r.home)),
      h('td', { class: 'num' }, num(r.cnt)),
      h('td', { class: 'num' }, r.distanceM === null ? none() : dist(r.distanceM)),
      h('td', { class: 'num' }, pct(r.shareTenths)),
      lc.hasModel ? h('td', { class: 'num model-col' }, r.modelTenths === null ? none() : pct(r.modelTenths)) : null)));
    add(S.line, 
      sectionHead(t('jikju_sh_line_title'), t('jikju_sh_line_hint_format', V.LINE_TOPN), t('web_sh_line_def')),
      h('p', { class: 'band' }, t('jikju_sh_line_a11y_format', nm(sgg))),
      h('div', { class: 'table-wrap' }, h('table', { 'aria-label': t('jikju_sh_line_a11y_format', nm(sgg)) }, h('thead', null, h('tr', null, heads)), tbody)),
      h('p', { class: 'caption' }, t('web_sh_line_sort_caption')),
      lc.hasModel ? h('p', { class: 'caption model-col' }, t('jikju_model_def')) : null,
    );
  }

  const first = V.workRow(works, new URLSearchParams(location.search).get('work'))?.code ?? firstWork({ ...ctx, works });
  workPicker(S.work, { groups: D.groupWorks(works, params), value: first, onChange: (code) => setWork(code), regionIdx: ctx.regionIdx });
  await setWork(first);
}
