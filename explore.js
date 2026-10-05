import { startPage, loadSnapshot, firstWork, snapshotFor } from './app/page.js';
import { workPicker, rememberWork, setWorkQuery } from './app/shell.js';
import { t } from './app/i18n.js';
import { h, add, clear, byId, chips, bars, status, sectionHead } from './app/ui.js';
import { num, pct, manwon, dist, ym } from './app/fmt.js';
import * as V from './app/views.js';

const PAGE = 20;
const KIND_LABEL = { all: 'web_kind_all', apt: 'web_kind_apt', row_house: 'web_kind_row_house', officetel: 'web_kind_officetel' };

const ctx = await startPage({ base: './', nav: 'explore' });
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
  let summaryDoc = null;
  try {
    summaryDoc = await ctx.file('workplace/summary');
  } catch {
    summaryDoc = null;
  }
  const works = ctx.works.filter((w) => ctx.store.has(`flow/work/${w.code}`));
  const groups = (await import('./app/data.js')).groupWorks(works, params);
  const state = {
    work: null, age: null, sex: null, deal: 'trade', kind: 'all', budgetIdx: V.defaultBudgetIndex('trade'), home: null, cmp: [], shown: PAGE, flowDoc: null,
  };
  const S = {
    work: byId('sec-work'), top: byId('sec-top'), model: byId('sec-model'), homes: byId('sec-homes'), cmp: byId('sec-compare'),
  };
  if (works.length === 0) {
    S.work.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return;
  }
  const ages = (code) => [{ value: null, label: t('jikju_age_all') }, ...((state.flowDoc && state.flowDoc.age_bands) || []).map((a) => ({ value: a, label: J.ageBandLabel(a, 'ko') }))];
  const sexes = [{ value: null, label: t('jikju_sex_all') }, { value: 'M', label: t('jikju_sex_m') }, { value: 'F', label: t('jikju_sex_f') }];
  const workName = () => V.label(state.work, { regionIdx: ctx.regionIdx, flowDoc: state.flowDoc });

  async function setWork(code) {
    state.work = code;
    state.home = null;
    state.cmp = [];
    state.shown = PAGE;
    rememberWork(code);
    setWorkQuery(code);
    S.top.replaceChildren(status('loading', t('web_loading')));
    try {
      state.flowDoc = await ctx.file(`flow/work/${code}`);
    } catch {
      S.top.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => setWork(code), retryLabel: t('web_retry') }));
      return;
    }
    renderAll();
  }

  function renderAll() {
    renderTop();
    renderModel();
    renderHomes();
    renderCompare();
  }

  function renderTop() {
    const fd = state.flowDoc;
    clear(S.top);
    if (!fd) return;
    const scope = (fd.scope && Number.isInteger(fd.scope.excluded_ratio_tenths)) ? fd.scope.excluded_ratio_tenths : (V.workRow(ctx.works, state.work)?.excludedRatioTenths ?? null);
    const ageBox = h('div', { class: 'chips' });
    const sexBox = h('div', { class: 'chips' });
    chips(ageBox, ages(), state.age, (v) => { state.age = v; renderTop(); renderCompare(); }, { ariaLabel: t('jikju_age_title') });
    chips(sexBox, sexes, state.sex, (v) => { state.sex = v; renderTop(); renderCompare(); }, { ariaLabel: t('jikju_sex_title') });
    const top = V.topHomes({ flowDoc: fd, age: state.age, sex: state.sex, topN: params.jikjuHomeShareTopNDefault, J });
    const ctxN = { regionIdx: ctx.regionIdx, flowDoc: fd };
    add(S.top, 
      sectionHead(t('jikju_rec_title_format', workName()), t('jikju_rec_sub')),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_age_title')), ageBox),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_sex_title')), sexBox),
      scope === null ? null : h('p', { class: 'band' }, t('jikju_excluded_format', pct(scope))),
      h('h3', null, t('jikju_homes_top_title_format', top.rows.length)),
    );
    if (top.rows.length === 0) {
      add(S.top, status('empty', t('jikju_filter_empty')));
      return;
    }
    add(S.top, 
      bars(top.rows.map((r) => ({
        key: r.home,
        label: V.label(r.home, ctxN),
        tenths: r.shareTenths,
        tag: r.flagged ? t('jikju_check_tag') : null,
        note: r.home === state.work ? t('jikju_same_sgg') : null,
      })), {
        onPick: (home) => { state.home = home; state.shown = PAGE; renderHomes(); S.homes.scrollIntoView({ block: 'start' }); },
        picked: state.home,
        valueText: (r) => pct(r.tenths),
        ariaLabel: t('jikju_homes_top_title_format', top.rows.length),
      }),
      h('p', { class: 'foot' }, t('jikju_people_format', V.filterLabel(J, state.age, state.sex), num(top.sumCnt))),
      h('p', { class: 'caption' }, t('web_top_sort_caption')),
      top.rows.some((r) => r.flagged) ? h('p', { class: 'caption' }, t('jikju_check_def')) : null,
    );
  }

  function renderModel() {
    clear(S.model);
    const m = V.modelTop(modelDoc, state.work, 10);
    S.model.hidden = m === null;
    if (m === null) return;
    const ctxN = { regionIdx: ctx.regionIdx, flowDoc: state.flowDoc };
    add(S.model, 
      sectionHead(t('jikju_model_title'), null, t('jikju_model_def')),
      bars(m.rows.map((r) => ({ key: r.home, label: V.label(r.home, ctxN), tenths: r.shareTenths })), {
        valueText: (r) => pct(r.tenths),
        ariaLabel: t('jikju_model_section_a11y_format', m.rows.length),
      }),
      m.restCount > 0 ? h('p', { class: 'foot' }, t('web_model_rest_format', m.restCount, pct(m.restTenths))) : null,
      h('p', { class: 'caption' }, t('web_model_sort_caption')),
    );
  }

  async function renderHomes() {
    clear(S.homes);
    if (!state.home) {
      add(S.homes, sectionHead(t('jikju_rec_pick_home'), t('jikju_rec_pick_home_hint')));
      return;
    }
    const ctxN = { regionIdx: ctx.regionIdx, flowDoc: state.flowDoc };
    const dealBox = h('div', { class: 'chips' });
    const kindBox = h('div', { class: 'chips' });
    chips(dealBox, V.DEALS.map((d) => ({ value: d, label: t(d === 'trade' ? 'jikju_deal_trade' : 'jikju_deal_jeonse') })), state.deal, (v) => {
      state.deal = v; state.budgetIdx = V.defaultBudgetIndex(v); state.shown = PAGE; renderHomes();
    }, { ariaLabel: t('jikju_deal_title') });
    chips(kindBox, V.KINDS.map((k) => ({ value: k, label: t(KIND_LABEL[k]) })), state.kind, (v) => { state.kind = v; state.shown = PAGE; renderHomes(); }, { ariaLabel: t('jikju_kind_title') });
    const budgets = V.BUDGETS[state.deal];
    const budget = budgets[state.budgetIdx];
    const dealLabel = t(state.deal === 'trade' ? 'jikju_deal_trade' : 'jikju_deal_jeonse');
    const out = h('output', { class: 'budget-value', for: 'budget' }, t('jikju_budget_value_format', dealLabel, manwon(budget)));
    const slider = h('input', {
      id: 'budget', type: 'range', min: 0, max: budgets.length - 1, step: 1, value: state.budgetIdx,
      'aria-label': t('jikju_budget_slider_a11y'), 'aria-valuetext': manwon(budget),
    });
    const listBox = h('div', { class: 'cx-box' });
    slider.addEventListener('input', () => {
      state.budgetIdx = Number(slider.value);
      const b = budgets[state.budgetIdx];
      out.textContent = t('jikju_budget_value_format', dealLabel, manwon(b));
      slider.setAttribute('aria-valuetext', manwon(b));
      renderList(listBox);
    });
    add(S.homes, 
      sectionHead(t('jikju_rec_complexes_title_format', V.label(state.home, ctxN))),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_deal_title')), dealBox),
      h('div', { class: 'filter' }, h('span', { class: 'filter-label' }, t('jikju_kind_title')), kindBox),
      h('div', { class: 'filter budget' }, h('span', { class: 'filter-label' }, t('jikju_budget_title')), out, slider),
      listBox,
    );
    await renderList(listBox);
  }

  async function renderList(box) {
    clear(box);
    const home = state.home;
    if (!ctx.store.has(`homes/${home}`)) return; // 이 빌드에 거주지 파일이 없다 — 섹션을 비운다(지어내지 않는다)
    if (!ctx.snap) {
      add(box, status('empty', t('web_snapshot_none')));
      return;
    }
    let homesDoc;
    let snapDoc;
    try {
      homesDoc = await ctx.file(`homes/${home}`);
      snapDoc = await snapshotFor(ctx, home);
    } catch {
      add(box, status('error', t('jikju_price_error'), { onRetry: () => renderList(box), retryLabel: t('web_retry') }));
      return;
    }
    if (state.home !== home || homesDoc === null) return;
    const list = V.complexList({
      homesDoc, snapDoc, deal: state.deal, kind: state.kind, budgetManwon: V.BUDGETS[state.deal][state.budgetIdx], J, workPoint: V.pointOf(state.work, ctx.regionIdx),
    });
    if (list.total === 0 || list.priced === 0 && list.kindTotal === list.total && list.total > 0 && list.rows.every((r) => !r.inSnapshot)) {
      add(box, status('empty', t('jikju_rec_no_complexes')));
      return;
    }
    if (list.kindTotal === 0) {
      add(box, status('empty', t('jikju_rec_no_kind_format', t(KIND_LABEL[state.kind]))));
      return;
    }
    add(box, h('p', { class: 'verdict' }, t('jikju_rec_verdict_format', num(list.affordableCount), num(list.priced))));
    if (list.priced > 0 && list.affordableCount === 0) add(box, status('empty', t('jikju_rec_no_affordable')));
    add(box, h('p', { class: 'caption' }, t('web_rec_sort_caption')));
    const ol = h('ol', { class: 'cx-list' });
    for (const r of list.rows.slice(0, state.shown)) add(ol, complexRow(r));
    add(box, ol);
    const rest = list.rows.length - state.shown;
    if (rest > 0) {
      add(box, h('button', { type: 'button', class: 'btn', onclick: () => { state.shown += PAGE; renderList(box); } }, t('jikju_more_format', Math.min(rest, PAGE))));
    }
  }

  function complexRow(r) {
    const meta = [
      t(KIND_LABEL[r.kind] ?? 'web_kind_all'),
      Number.isInteger(r.areaHundredths) ? t('web_row_area_format', (r.areaHundredths / 100).toFixed(0)) : null,
      r.price !== null ? manwon(r.price) : null,
      r.ym ? t('web_row_basis_format', ym(r.ym)) : null,
      Number.isInteger(r.count12m) ? t('jikju_row_trades_format', num(r.count12m)) : null,
      Number.isInteger(r.builtYear) ? t('web_row_built_format', String(r.builtYear)) : null,
    ].filter(Boolean).join(' · ');
    const rail = r.rail_m !== null && r.rail_m !== undefined ? t('jikju_row_rail_format', r.rail_name ?? '', r.rail_lines ?? '', dist(r.rail_m)) : t('jikju_row_rail_none');
    const bus = r.bus_m !== null && r.bus_m !== undefined ? t('jikju_row_bus_format', dist(r.bus_m)) : t('jikju_row_bus_none');
    let verdict;
    if (r.verdict === null) verdict = h('span', { class: 'pill pill-none' }, t('jikju_row_price_unknown'));
    else if (r.verdict.pass) verdict = h('span', { class: 'pill pill-ok' }, t('jikju_row_ok_format', pct(r.verdict.marginTenths)));
    else verdict = h('span', { class: 'pill pill-short' }, t('jikju_row_short_format', pct(-r.verdict.marginTenths)));
    return h('li', { class: 'cx-row' },
      h('div', { class: 'cx-head' }, h('span', { class: 'cx-name' }, r.name ?? t('web_row_id_format', String(r.complex_id))), verdict),
      h('p', { class: 'cx-meta' }, meta),
      h('p', { class: 'cx-meta' }, `${rail} · ${bus}`),
      r.distToWorkM !== null ? h('p', { class: 'cx-meta' }, t('jikju_dist_to_format', workName(), dist(r.distToWorkM))) : null);
  }

  function renderCompare() {
    clear(S.cmp);
    const fd = state.flowDoc;
    if (!fd) return;
    const ctxN = { regionIdx: ctx.regionIdx, flowDoc: fd };
    const top = V.topHomes({ flowDoc: fd, age: state.age, sex: state.sex, topN: params.jikjuHomeShareTopNDefault, J }).rows;
    state.cmp = state.cmp.filter((c) => top.some((r) => r.home === c));
    const pickBox = h('div', { class: 'chips', role: 'group', 'aria-label': t('jikju_cmp_pick_title') });
    for (const r of top) {
      const on = state.cmp.includes(r.home);
      add(pickBox, h('button', {
        type: 'button', class: `chip${on ? ' is-on' : ''}`, 'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          if (on) state.cmp = state.cmp.filter((c) => c !== r.home);
          else state.cmp = [...state.cmp, r.home].slice(-3);
          renderCompare();
        },
      }, V.label(r.home, ctxN)));
    }
    add(S.cmp, 
      sectionHead(t('jikju_cmp_pick_title'), t('jikju_cmp_sub')),
      h('p', { class: 'caption' }, t('jikju_cmp_pick_hint')),
      pickBox,
    );
    if (state.cmp.length === 0) {
      add(S.cmp, status('empty', t('jikju_cmp_pick_empty')));
      return;
    }
    const all = J.homeShareRank(fd.cells || [], state.age, state.sex, 100000).rows;
    const shareMap = new Map(all.map((r) => [r.home, r.shareTenths]));
    const m = V.compareModel({
      picked: [...state.cmp].sort(), work: state.work, regionIdx: ctx.regionIdx, flowDoc: fd, shareMap, summaryDoc, snapDoc: ctx.snap, J,
    });
    add(S.cmp, h('h3', null, t('jikju_cmp_table_title')), h('p', { class: 'caption' }, t('jikju_cmp_header_format', t('web_cmp_bucket'), 6)), compareTable(m));
    add(S.cmp, h('p', { class: 'caption' }, t('jikju_cmp_best_note')));
  }

  function compareTable(m) {
    const wn = workName();
    const bucket = t('web_cmp_bucket');
    const ROWS = [
      ['distanceM', t('jikju_cmp_row_distance_format', wn), (v) => dist(v)],
      ['shareTenths', t('jikju_cmp_row_share_format', wn), (v) => pct(v)],
      ['workplaces', t('jikju_cmp_row_workplaces'), (v) => num(v)],
      ['members', t('jikju_cmp_row_members'), (v) => num(v)],
      ['tradeMedianManwon', t('jikju_cmp_row_trade_format', bucket), (v) => manwon(v)],
      ['jeonseMedianManwon', t('jikju_cmp_row_jeonse_format', bucket), (v) => manwon(v)],
      ['ratioTenths', t('jikju_cmp_row_ratio_format', 6), (v) => pct(v)],
    ];
    const thead = h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('jikju_cmp_col_item')), m.cols.map((c) => h('th', { scope: 'col', class: 'num' }, c.label))));
    const tbody = h('tbody', null, ROWS.map(([key, lab, f]) => h('tr', null,
      h('th', { scope: 'row' }, lab),
      m.input.map((x) => {
        const v = x[key];
        const best = m.best[key].best === x.code && m.input.length > 1;
        return h('td', { class: `num${best ? ' best' : ''}`, title: best ? t('jikju_cmp_best_a11y') : null },
          v === null ? h('span', { 'aria-label': t('jikju_value_none_a11y') }, t('jikju_value_none')) : f(v));
      }))));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'cmp' }, thead, tbody));
  }

  const first = V.workRow(works, new URLSearchParams(location.search).get('work'))?.code ?? firstWork({ ...ctx, works });
  workPicker(S.work, { groups, value: first, onChange: (code) => setWork(code), regionIdx: ctx.regionIdx });
  await setWork(first);
}
