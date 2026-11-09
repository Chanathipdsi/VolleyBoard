import { EN } from './en.js';
let lang = 'th';
export const getLang = () => lang;
export function setLang(l) { lang = l === 'en' ? 'en' : 'th'; document.documentElement.lang = lang; }
// Thai is the source language: t('ข้อความไทย') returns it as is, or the English entry when lang === 'en'.
export function t(s, vars) {
  let out = lang === 'en' && EN[s] !== undefined ? EN[s] : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : vars[k]));
  return out;
}
export const locale = (buddhist) => (lang === 'en' ? 'en-GB' : buddhist === false ? 'th-TH-u-ca-gregory' : 'th-TH');
