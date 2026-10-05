import { t } from './i18n.js';
import { h, clear } from './ui.js';
import * as D from './data.js';
import { compareCodePoints } from '../core/jikju.js';

export const NAV = Object.freeze([
  ['explore', 'index.html', 'jikju_tab_recommend'],
  ['flowmap', 'analysis/flowmap.html', 'jikju_tab_flowmap'],
  ['gap', 'analysis/gap.html', 'web_nav_gap'],
  ['shuttle', 'analysis/shuttle.html', 'jikju_tab_shuttle'],
  ['flowchange', 'analysis/flowchange.html', 'jikju_tab_flowchange'],
]);

export function renderShell({ base = './', nav = null } = {}) {
  const head = document.getElementById('site-head');
  const foot = document.getElementById('site-foot');
  if (head) {
    clear(head);
    head.append(
      h('div', { class: 'brand-row' },
        h('a', { class: 'brand', href: `${base}index.html` }, t('web_site_name')),
        h('span', { id: 'source-badge', class: 'dev-badge' })),
      h('nav', { class: 'site-nav', 'aria-label': t('web_nav_a11y') },
        h('ul', null, NAV.map(([key, path, label]) => h('li', null,
          h('a', { href: `${base}${path}`, 'data-nav': key, 'aria-current': key === nav ? 'page' : null }, t(label)))))),
      h('p', { id: 'basis-line', class: 'basis' }),
      h('p', { class: 'def-line' }, t('web_work_def')),
    );
  }
  if (foot) {
    clear(foot);
    foot.append(
      h('p', null, h('a', { href: `${base}about.html`, 'data-nav': 'about' }, t('web_footer_link'))),
      h('p', { class: 'muted' }, t('web_footer_app')),
    );
  }
}


const WORK_KEY = 'zzd.web.jikju.work';

export function rememberWork(code) {
  try {
    localStorage.setItem(WORK_KEY, code);
  } catch {
  }
}

function recalledWork() {
  try {
    return localStorage.getItem(WORK_KEY);
  } catch {
    return null;
  }
}

export function initialWork(works, search, hasFile = () => true) {
  const codes = new Set(works.map((w) => w.code));
  const q = new URLSearchParams(search ?? '').get('work');
  if (q && codes.has(q)) return q;
  const r = recalledWork();
  if (r && codes.has(r)) return r;
  const withFile = works.find((w) => hasFile(w.code));
  return withFile ? withFile.code : works.length ? works[0].code : null;
}

export function workPicker(container, { groups, value, onChange, regionIdx = null }) {
  clear(container);
  const sidoSel = h('select', { id: 'pick-sido', 'aria-label': t('web_pick_sido') });
  const sggSel = h('select', { id: 'pick-sgg', 'aria-label': t('web_pick_sgg') });
  const sidoOf = new Map(); // sidoCode → works
  for (const g of groups) {
    const og = h('optgroup', { label: t(D.regionLabelKey(g.region)) });
    for (const s of g.sidos) {
      sidoOf.set(s.sidoCode, s.works);
      og.append(h('option', { value: s.sidoCode }, s.sido || s.sidoCode));
    }
    sidoSel.append(og);
  }
  const fillSgg = (sido, pick) => {
    clear(sggSel);
    const ws = [...(sidoOf.get(sido) || [])].sort((a, b) => compareCodePoints(a.code, b.code));
    for (const w of ws) {
      const r = regionIdx ? regionIdx.get(w.code) : null;
      const nm = r && r.name_note ? `${w.name} ${t('jikju_name_note_legacy')}` : w.name;
      sggSel.append(h('option', { value: w.code, selected: w.code === pick ? true : null }, nm));
    }
    if (pick && ws.some((w) => w.code === pick)) sggSel.value = pick;
  };
  const curSido = value ? value.slice(0, 2) : groups[0]?.sidos[0]?.sidoCode;
  sidoSel.value = curSido;
  fillSgg(curSido, value);
  sidoSel.addEventListener('change', () => {
    fillSgg(sidoSel.value, null);
    if (sggSel.value) onChange(sggSel.value);
  });
  sggSel.addEventListener('change', () => onChange(sggSel.value));
  container.append(
    h('p', { class: 'field-caption' }, t('jikju_work_sheet_caption')),
    h('div', { class: 'work-pick' },
      h('label', { class: 'field' }, h('span', null, t('web_pick_sido')), sidoSel),
      h('label', { class: 'field' }, h('span', null, t('web_pick_sgg')), sggSel)),
  );
}

export function setWorkQuery(code) {
  try {
    const u = new URL(location.href);
    u.searchParams.set('work', code);
    history.replaceState(null, '', u);
  } catch {
  }
}
