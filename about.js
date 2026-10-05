import { startPage, loadSnapshot } from './app/page.js';
import { renderShell } from './app/shell.js';
import { t } from './app/i18n.js';
import { h, add, byId, clear, sectionHead } from './app/ui.js';
import { num } from './app/fmt.js';
import * as V from './app/views.js';

export const SOURCE_KEYS = Object.freeze([
  'my_notice_jikju_source_flow',
  'my_notice_jikju_source_workplace',
  'my_notice_jikju_source_rail',
  'my_notice_jikju_source_bus',
  'my_notice_jikju_source_bus_seoul',
  'my_notice_jikju_source_seoul_flow',
  'my_notice_jikju_source_legal_dong',
]);

function linkify(text) {
  return text.split(/(https:\/\/\S+)/).filter((s) => s !== '').map((s) => (s.startsWith('https://') ? h('a', { href: s, rel: 'noopener noreferrer' }, s) : s));
}

function para(key, cls = null) {
  return h('p', { class: cls }, t(key));
}

function renderStatic() {
  const root = byId('about-static');
  clear(root);
  add(root, 
    h('section', { class: 'card' },
      h('h1', null, t('web_nav_about')),
      h('p', { class: 'sub' }, t('my_notice_jikju_section'))),
    h('section', { class: 'card' },
      h('h2', null, t('web_about_def_title')),
      para('web_work_def', 'def-line'),
      para('my_notice_jikju_data')),
    h('section', { class: 'card' },
      h('h2', null, t('web_about_scope_title')),
      para('my_notice_jikju_scope')),
    h('section', { class: 'card' },
      h('h2', null, t('web_about_method_title')),
      para('web_about_method'),
      para('my_notice_jikju_model'),
      para('web_about_model_regions'),
      para('my_notice_jikju_price'),
      para('web_about_snapshot'),
      para('my_notice_jikju_drt'),
      para('my_notice_jikju_flowchange')),
    h('section', { class: 'card' },
      h('h2', null, t('web_about_sources_title')),
      h('ul', { class: 'src-list' }, SOURCE_KEYS.map((k) => h('li', { 'data-key': k }, linkify(t(k)))))),
    h('section', { class: 'card' },
      h('h2', null, t('web_about_license_title')),
      para('web_about_license'),
      h('ul', { class: 'src-list' },
        h('li', null, t('web_about_kogl_format', t('web_about_kogl_bus'), 'OA-15067')),
        h('li', null, t('web_about_kogl_format', t('web_about_kogl_flow'), 'OA-22300'))),
      para('my_notice_jikju_not_affiliated')),
    h('section', { class: 'card' },
      para('my_notice_jikju_workcodes'),
      para('web_about_legacy_detail')),
    h('section', { class: 'card' },
      para('web_about_privacy', 'muted'),
      para('web_about_contact', 'muted')),
  );
}

function renderLegacy(ctx) {
  const box = byId('app');
  clear(box);
  const idx = ctx.flowIndex || {};
  const nm = (code) => V.label(code, { regionIdx: ctx.regionIdx });
  const ex = Array.isArray(idx.excluded_works) ? [...idx.excluded_works].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)) : [];
  const lh = idx.legacy_homes || {};
  const kept = [...(lh.kept_1to1 || []), ...(lh.kept_split || [])].sort();
  add(box, 
    sectionHead(t('web_about_legacy_title')),
    ex.length === 0 ? null : h('ul', { class: 'legacy-list' }, ex.map((w) => h('li', null,
      t('web_about_legacy_works_format', w.name ?? w.code, w.code, Number.isInteger(w.persons) ? num(w.persons) : t('jikju_value_none'), w.reason ?? '')))),
    kept.length === 0 ? null : h('p', { class: 'caption' }, t('web_about_legacy_kept_format', kept.map((c) => `${nm(c)}(${c})`).join(', '))),
  );
}

renderShell({ base: './', nav: 'about' });
renderStatic();
const ctx = await startPage({ base: './', nav: 'about' });
if (ctx) {
  await loadSnapshot(ctx);
  renderLegacy(ctx);
}
