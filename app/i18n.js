import ko from '../i18n/ko.js';

let table = ko;
const missing = new Set();

export function setTable(t) {
  table = t;
}

export function has(key) {
  return Object.hasOwn(table, key);
}

export function t(key, ...args) {
  if (!Object.hasOwn(table, key)) {
    missing.add(key);
    return key;
  }
  return table[key].replace(/%(\d+)\$[sd]|%%/g, (m, n) => (m === '%%' ? '%' : String(args[Number(n) - 1] ?? '')));
}

export function missingKeys() {
  return [...missing];
}

export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
