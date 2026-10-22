// Language helpers. Dutch is the default, English lives under /en/ and is stored as sessions.lang / reflections.lang.

function normLang(l) {
  return String(l || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'nl';
}

// URL prefix for the language ('/en' for English, nothing for Dutch).
function pre(lang) {
  return lang === 'en' ? '/en' : '';
}

// Language of the visitor who made this request: explicit lang first, then the page they came from.
function reqLang(event, explicit) {
  if (explicit) return normLang(explicit);
  const q = event && event.queryStringParameters && event.queryStringParameters.lang;
  if (q) return normLang(q);
  const h = (event && event.headers) || {};
  const ref = h.referer || h.Referer || '';
  try {
    const p = new URL(ref).pathname;
    if (p === '/en' || p.indexOf('/en/') === 0) return 'en';
  } catch (e) { /* no usable referer */ }
  return 'nl';
}

// tr(lang, dutchText, englishText)
function tr(lang, nl, en) {
  return lang === 'en' ? en : nl;
}

const CATEGORY_EN = {
  koppel: 'couple / relationship',
  familie: 'family',
  vrienden: 'friends',
  buren: 'neighbors',
  werk: 'work / coworkers',
  school: 'school',
  andere: 'other',
};
function categoryLabel(lang, category) {
  if (lang === 'en') return CATEGORY_EN[category] || category;
  return category;
}

// Common email chrome used by several functions.
function greeting(lang, name) {
  const safe = name ? ' ' + name : '';
  return lang === 'en' ? `Hi${safe},` : `Hey${safe},`;
}

module.exports = { normLang, pre, reqLang, tr, categoryLabel, greeting };
