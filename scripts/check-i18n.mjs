import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const locales = ['ja', 'en', 'ar', 'ko', 'zh'];
const keyPattern = /^\s*'([^']+)'\s*:/gm;
const catalogs = new Map();

for (const locale of locales) {
  const file = resolve(process.cwd(), 'lib', 'locales', locale + '.ts');
  const source = readFileSync(file, 'utf8');
  const keys = [...source.matchAll(keyPattern)].map(match => match[1]);
  if (!keys.length || new Set(keys).size !== keys.length || /:\s*''\s*,/u.test(source)) {
    console.error('Invalid or duplicate translation entries in ' + locale);
    process.exitCode = 1;
  }
  catalogs.set(locale, keys);
}
const base = catalogs.get('ja') || [];
for (const locale of locales.filter(item => item !== 'ja')) {
  const current = new Set(catalogs.get(locale) || []);
  const baseSet = new Set(base);
  const missing = base.filter(key => !current.has(key));
  const extra = [...current].filter(key => !baseSet.has(key));
  if (missing.length || extra.length) {
    console.error(locale + ' catalog mismatch: missing=' + missing.join(', ') + '; extra=' + extra.join(', '));
    process.exitCode = 1;
  }
}
if (!process.exitCode) console.log('i18n catalogs verified: ' + locales.join(', ') + ' (' + base.length + ' keys)');
