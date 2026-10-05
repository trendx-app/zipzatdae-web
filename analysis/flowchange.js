import { startPage, loadSnapshot } from '../app/page.js';
import { t } from '../app/i18n.js';
import { h, add, clear, byId, status, sectionHead } from '../app/ui.js';
import { num, pct, ym } from '../app/fmt.js';
import * as V from '../app/views.js';

const ctx = await startPage({ base: '../', nav: 'flowchange', needWorks: false });
if (ctx) await main(ctx);

async function main(ctx) {
  await loadSnapshot(ctx);
  const S = { def: byId('sec-def'), up: byId('sec-up'), down: byId('sec-down'), hubs: byId('sec-hubs') };
  const name = V.latestFlowChangeName(ctx.files);
  let doc = null;
  try {
    doc = name ? await ctx.file(name) : null;
  } catch {
    S.def.replaceChildren(status('error', t('jikju_load_error'), { onRetry: () => location.reload(), retryLabel: t('web_retry') }));
    return;
  }
  const m = V.flowChangeModel(doc);
  if (m === null) {
    S.def.replaceChildren(sectionHead(t('jikju_tab_flowchange')), status('empty', t('web_fc_empty')));
    return;
  }
  const nm = (code) => V.label(code, { regionIdx: ctx.regionIdx });
  const per = (k) => {
    const p = m.periods && m.periods[k] ? ym(m.periods[k]) : null;
    const d = m.days && m.days[k] ? V.daysLabel(m.days[k]) : null;
    return p && d ? `${p} (${d})` : p ?? d ?? '—';
  };
  const th = m.thresholds || {};
  add(S.def, 
    sectionHead(t('jikju_tab_flowchange'), t('web_fc_sub')),
    h('p', { class: 'band' }, t('jikju_fc_population_band')),
    h('p', { class: 'def' }, t('web_fc_mix_note')),
    h('p', null, t('web_fc_periods_format', per('prev'), per('cur'))),
    m.overallPerMille === null ? null : h('p', { class: 'caption' }, t('web_fc_overall_format', V.signedPct(m.overallPerMille))),
    Number.isInteger(th.minCount) && Number.isInteger(th.risePerMille) && Number.isInteger(th.fallPerMille)
      ? h('p', { class: 'caption' }, t('web_fc_rule_format', num(th.minCount), pct(th.risePerMille), pct(Math.abs(th.fallPerMille))))
      : null,
    m.reproduced && m.reproduced.days
      ? h('p', { class: 'caption' }, t('web_fc_reproduced_format', V.daysLabel(m.reproduced.days.prev), V.daysLabel(m.reproduced.days.cur)))
      : null,
  );

  const pairTable = (rows) => {
    const thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('web_fc_col_pair')),
      h('th', { scope: 'col', class: 'num' }, t('web_fc_col_prev')),
      h('th', { scope: 'col', class: 'num' }, t('web_fc_col_cur')),
      h('th', { scope: 'col', class: 'num' }, t('web_fc_col_rel')),
      h('th', { scope: 'col' }, t('web_fc_col_rep'))));
    const tbody = h('tbody', null, rows.map((r) => h('tr', null,
      h('th', { scope: 'row' }, t('jikju_fc_pair_format', nm(r.home), nm(r.work))),
      h('td', { class: 'num' }, num(r.prev)),
      h('td', { class: 'num' }, num(r.cur)),
      h('td', { class: 'num' }, V.signedPct(r.relPerMille)),
      h('td', null, r.reproduced ? t('web_fc_rep_yes') : h('span', { 'aria-label': t('jikju_value_none_a11y') }, t('jikju_value_none'))))));
    return h('div', { class: 'table-wrap' }, h('table', null, thead, tbody));
  };

  const pairs = (el, titleKey, rows) => {
    clear(el);
    add(el, sectionHead(t(titleKey)));
    if (rows.length === 0) add(el, status('empty', t('web_fc_empty')));
    else add(el, pairTable(rows), h('p', { class: 'caption' }, t('web_fc_sort_caption')));
  };
  pairs(S.up, 'web_fc_up_title', m.up);
  pairs(S.down, 'web_fc_down_title', m.down);

  clear(S.hubs);
  add(S.hubs, sectionHead(t('web_fc_hubs_title'), Number.isInteger(th.hubMinPairs) ? t('web_fc_hubs_note_format', th.hubMinPairs) : null));
  if (m.hubs.length === 0) {
    add(S.hubs, status('empty', t('web_fc_empty')));
  } else {
    const thead = h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, t('web_fc_col_hub')),
      h('th', { scope: 'col', class: 'num' }, t('web_fc_col_hub_pairs')),
      h('th', { scope: 'col', class: 'num' }, t('web_fc_col_hub_rep'))));
    const tbody = h('tbody', null, m.hubs.map((r) => h('tr', null,
      h('th', { scope: 'row' }, nm(r.work)),
      h('td', { class: 'num' }, num(r.pairs)),
      h('td', { class: 'num' }, Number.isInteger(r.reproduced) ? num(r.reproduced) : t('jikju_value_none')))));
    add(S.hubs, h('div', { class: 'table-wrap' }, h('table', null, thead, tbody)));
  }
}
