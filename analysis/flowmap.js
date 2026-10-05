import { startPage, loadSnapshot, firstWork } from '../app/page.js';
import { workPicker, rememberWork, setWorkQuery } from '../app/shell.js';
import { t } from '../app/i18n.js';
import { h, add, svg, clear, byId, chips, bars, status, sectionHead, downloadText } from '../app/ui.js';
import { num, pct, csvRow } from '../app/fmt.js';
import * as D from '../app/data.js';
import * as V from '../app/views.js';

const ctx = await startPage({ base: '../', nav: 'flowmap' });
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
  const works = ctx.works.filter((w) => ctx.store.has(`flow/work/${w.code}`));
  const S = { work: byId('sec-work'), flow: byId('sec-flow'), model: byId('sec-model'), age: byId('sec-age') };
  if (works.length === 0) {
    S.work.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return;
  }
  const state = { work: null, age: null, sex: null, flowDoc: null, showModel: false, tableSex: null };
  const ctxN = () => ({ regionIdx: ctx.regionIdx, flowDoc: state.flowDoc });
  const workName = () => V.label(state.work, ctxN());

  async function setWork(code) {
    state.work = code;
    rememberWork(code);
    setWorkQuery(code);
    S.flow.replaceChildren(status('loading', t('web_loading')));
    clear(S.age);
    try {
      state.flowDoc = await ctx.file(`flow/work/${code}`);
    } catch {
      S.flow.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => setWork(code), retryLabel: t('web_retry') }));
      return;
    }
    renderFlow();
    renderModel();
    renderAge();
  }

  function renderFlow() {
    const fd = state.flowDoc;
    clear(S.flow);
    if (!fd) return;
    const ageItems = [{ value: null, label: t('jikju_age_all') }, ...(fd.age_bands || []).map((a) => ({ value: a, label: J.ageBandLabel(a, 'ko') }))];
    const sexItems = [{ value: null, label: t('jikju_sex_all') }, { value: 'M', label: t('jikju_sex_m') }, { value: 'F', label: t('jikju_sex_f') }];
    const ageBox = h('div', { class: 'chips' });
    const sexBox = h('div', { class: 'chips' });
    chips(ageBox, ageItems, state.age, (v) => { state.age = v; renderFlow(); }, { ariaLabel: t('jikju_age_title') });
    chips(sexBox, sexItems, state.sex, (v) => { state.sex = v; renderFlow(); }, { ariaLabel: t('jikju_sex_title') });
    const scope = D.scopeOf(fd);
    const top10 = V.topHomes({ flowDoc: fd, age: state.age, sex: state.sex, topN: params.jikjuHomeShareTopNDefault, J });
    const top15 = V.topHomes({ flowDoc: fd, age: state.age, sex: state.sex, topN: V.MAP_LINES, J });
    add(S.flow, 
      sectionHead(t('jikju_flow_title_format', workName()), t('jikju_flow_sub')),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_age_title')), ageBox),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_sex_title')), sexBox),
      scope.excludedRatioTenths === null ? null : h('p', { class: 'band' }, t('jikju_excluded_format', pct(scope.excludedRatioTenths))),
    );
    if (top10.rows.length === 0) {
      add(S.flow, status('empty', t('jikju_filter_empty')));
      return;
    }
    add(S.flow, summaryCells(V.flowSummary({ flowDoc: fd, age: state.age, sex: state.sex, work: state.work, regionIdx: ctx.regionIdx, J })));
    add(S.flow, h('h3', null, t('web_flow_map_title')), flowMap(top15.rows), h('p', { class: 'caption' }, t('jikju_flow_legend_format', V.MAP_LINES)));
    add(S.flow, 
      h('h3', null, t('jikju_homes_top_title_format', top10.rows.length)),
      bars(top10.rows.map((r) => ({
        key: r.home, label: V.label(r.home, ctxN()), tenths: r.shareTenths, tag: r.flagged ? t('jikju_check_tag') : null, note: r.home === state.work ? t('jikju_same_sgg') : null,
      })), { valueText: (r) => pct(r.tenths), ariaLabel: t('jikju_homes_top_title_format', top10.rows.length) }),
      h('p', { class: 'foot' }, t('jikju_people_format', V.filterLabel(J, state.age, state.sex), num(top10.sumCnt))),
      h('p', { class: 'caption' }, t('web_top_sort_caption')),
      top10.rows.some((r) => r.flagged) ? h('p', { class: 'caption' }, t('jikju_check_def')) : null,
    );
    if (V.modelTop(modelDoc, state.work, 10) !== null) {
      add(S.flow, h('button', {
        type: 'button', class: 'btn', 'aria-pressed': state.showModel ? 'true' : 'false', 'aria-controls': 'sec-model',
        onclick: () => { state.showModel = !state.showModel; renderFlow(); renderModel(); },
      }, t('jikju_model_toggle')));
    }
  }

  function summaryCells(s) {
    const cell = (label, tenths) => h('div', { class: 'cell' }, h('span', { class: 'cell-label' }, label), h('span', { class: 'cell-value' }, pct(tenths)));
    const sidoName = (state.flowDoc && state.flowDoc.work_sido) || s.workSidoName;
    return h('div', null,
      h('div', { class: 'cells' },
        cell(t('jikju_same_sgg'), s.same),
        cell(t('jikju_flow_same_sido_format', sidoName), s.sameSido),
        ...s.others.map((o) => cell(o.name, o.tenths))),
      s.others.length > 0 ? h('p', { class: 'caption' }, t('jikju_flow_other_sido')) : null);
  }

  function flowMap(rows) {
    const g = V.mapGeometry({ rows, work: state.work, regionIdx: ctx.regionIdx });
    const max = Math.max(1, ...g.lines.map((l) => l.shareTenths));
    const title = t('jikju_flow_map_a11y_format', workName(), rows.length);
    const root = svg('svg', { class: 'flow-map', viewBox: `0 0 ${g.w} ${g.h}`, role: 'img', 'aria-label': title }, svg('title', null, title));
    if (g.work) {
      for (const l of g.lines) {
        add(root, svg('line', { x1: g.work.x, y1: g.work.y, x2: l.x, y2: l.y, 'stroke-width': Math.max(1.5, (l.shareTenths / max) * 14).toFixed(1) },
          svg('title', null, `${V.label(l.home, ctxN())} ${pct(l.shareTenths)}`)));
      }
    }
    for (const l of g.lines) add(root, svg('circle', { class: 'home-dot', cx: l.x, cy: l.y, r: 6 }));
    for (const l of g.lines.slice(0, 5)) add(root, svg('text', { x: l.x + 9, y: l.y - 9 }, V.label(l.home, ctxN())));
    if (g.work) add(root, svg('circle', { class: 'work-dot', cx: g.work.x, cy: g.work.y, r: 11 }));
    return root;
  }

  function renderModel() {
    clear(S.model);
    const m = state.showModel ? V.modelTop(modelDoc, state.work, 10) : null;
    S.model.hidden = m === null;
    if (m === null) return;
    add(S.model, 
      sectionHead(t('jikju_model_title'), null, t('jikju_model_def')),
      bars(m.rows.map((r) => ({ key: r.home, label: V.label(r.home, ctxN()), tenths: r.shareTenths })), {
        valueText: (r) => pct(r.tenths), ariaLabel: t('jikju_model_section_a11y_format', m.rows.length),
      }),
      m.restCount > 0 ? h('p', { class: 'foot' }, t('web_model_rest_format', m.restCount, pct(m.restTenths))) : null,
      h('p', { class: 'caption' }, t('web_model_sort_caption')),
    );
  }

  function renderAge() {
    const fd = state.flowDoc;
    clear(S.age);
    if (!fd) return;
    const sexBox = h('div', { class: 'chips' });
    const sexItems = [{ value: null, label: t('jikju_sex_all') }, { value: 'M', label: t('jikju_sex_m') }, { value: 'F', label: t('jikju_sex_f') }];
    chips(sexBox, sexItems, state.tableSex, (v) => { state.tableSex = v; renderAge(); }, { ariaLabel: t('jikju_sex_title') });
    const m = V.ageTableModel({ flowDoc: fd, sex: state.tableSex, J });
    const thead = h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('web_age_col_home')), m.cols.map((c) => h('th', { scope: 'col', class: 'num' }, J.ageBandLabel(c.ageBand, 'ko')))));
    const tbody = h('tbody', null, m.homes.map((home, i) => h('tr', null,
      h('th', { scope: 'row' }, V.label(home, ctxN())),
      m.cols.map((c) => h('td', { class: 'num' }, c.values[i] === null ? h('span', { 'aria-label': t('jikju_value_none_a11y') }, t('jikju_value_none')) : pct(c.values[i]))))));
    const tfoot = h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, t('web_people_unit')), m.cols.map((c) => h('td', { class: 'num' }, t('jikju_people_count_format', num(c.sumCnt))))));
    const csv = V.flowCsv({ flowDoc: fd, regionIdx: ctx.regionIdx, J });
    add(S.age, 
      sectionHead(t('web_age_table_title'), t('web_age_table_note')),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_sex_title')), sexBox),
      h('div', { class: 'table-wrap' }, h('table', { class: 'wide' }, thead, tbody, tfoot)),
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => downloadText(`zipzatdae_jikju_flow_${state.work}_${fd.basis_ym ?? ''}.csv`, [csvRow(csv.header), ...csv.lines.map(csvRow)].join('\r\n')),
      }, t('web_csv_download')),
      h('p', { class: 'caption' }, t('web_csv_note_format', num(csv.lines.length))),
    );
  }

  const first = V.workRow(works, new URLSearchParams(location.search).get('work'))?.code ?? firstWork({ ...ctx, works });
  workPicker(S.work, { groups: D.groupWorks(works, params), value: first, onChange: (code) => setWork(code), regionIdx: ctx.regionIdx });
  await setWork(first);
}
