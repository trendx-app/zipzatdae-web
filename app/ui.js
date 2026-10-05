export function h(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function add(el, ...children) {
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el;
}

export function chips(container, items, value, onChange, { ariaLabel } = {}) {
  clear(container);
  container.setAttribute('role', 'radiogroup');
  if (ariaLabel) container.setAttribute('aria-label', ariaLabel);
  for (const it of items) {
    const b = h('button', {
      type: 'button', class: `chip${it.value === value ? ' is-on' : ''}`, role: 'radio', 'aria-checked': it.value === value ? 'true' : 'false',
      onclick: () => onChange(it.value),
    }, it.label);
    container.append(b);
  }
  return container;
}

export function table(headers, rows, { numericCols = [], caption = null, rowClass = null } = {}) {
  const num = new Set(numericCols);
  const thead = h('thead', null, h('tr', null, headers.map((x, i) => h('th', { scope: 'col', class: num.has(i) ? 'num' : null }, x))));
  const tbody = h('tbody', null, rows.map((r, ri) => h('tr', { class: rowClass ? rowClass(ri) : null }, r.map((c, i) => h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, class: num.has(i) ? 'num' : null }, c)))));
  const t = h('table', null, caption ? h('caption', null, caption) : null, thead, tbody);
  return h('div', { class: 'table-wrap' }, t);
}

export function bars(rows, { onPick = null, picked = null, maxTenths = null, valueText = (r) => `${(r.tenths / 10).toFixed(1)}%`, ariaLabel = null } = {}) {
  const max = maxTenths ?? Math.max(1, ...rows.map((r) => r.tenths ?? 0));
  const list = h('ol', { class: 'bars', 'aria-label': ariaLabel });
  for (const r of rows) {
    const w = Math.max(2, Math.round(((r.tenths ?? 0) / max) * 100));
    const inner = [
      h('span', { class: 'bar-label' }, r.label, r.tag ? h('span', { class: 'tag' }, r.tag) : null),
      h('span', { class: 'bar-track', 'aria-hidden': 'true' }, fill(w)),
      h('span', { class: 'bar-value' }, valueText(r)),
      r.note ? h('span', { class: 'bar-note' }, r.note) : null,
    ];
    const li = h('li', { class: picked === r.key ? 'is-picked' : null });
    li.append(onPick ? h('button', { type: 'button', class: 'bar-btn', 'aria-pressed': picked === r.key ? 'true' : 'false', onclick: () => onPick(r.key) }, inner) : h('div', { class: 'bar-static' }, inner));
    list.append(li);
  }
  return list;
}

function fill(w) {
  const el = h('span', { class: 'bar-fill' });
  el.style.width = `${w}%`;
  return el;
}

export function svg(tag, attrs = null, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function status(kind, text, { onRetry = null, retryLabel = null } = {}) {
  return h('p', { class: `status status-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text, onRetry && retryLabel ? h('button', { type: 'button', class: 'btn-link', onclick: onRetry }, retryLabel) : null);
}

export function sectionHead(title, sub = null, def = null) {
  return h('header', { class: 'sec-head' }, h('h2', null, title), sub ? h('p', { class: 'sub' }, sub) : null, def ? h('p', { class: 'def' }, def) : null);
}

export function keepQueryLinks(root = document, keys = ['snapshot']) {
  const q = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  for (const k of keys) if (q.has(k)) keep.set(k, q.get(k));
  const extra = keep.toString();
  if (!extra) return;
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^(https?:)?\/\//.test(href) || href.startsWith('#') || href.startsWith('mailto:')) continue;
    const [path, hash] = href.split('#');
    a.setAttribute('href', `${path}${path.includes('?') ? '&' : '?'}${extra}${hash ? `#${hash}` : ''}`);
  }
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
