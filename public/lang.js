// Language handling for Middlepoint (Dutch at /, English at /en/).
// The URL decides the language. The switcher remembers the visitor's choice.
// On a Dutch page, an English-first browser gets a small, dismissible hint to switch (never an automatic redirect, so search engines keep seeing the Dutch page).
(function () {
  var path = location.pathname;
  var isEn = path === '/en' || path.indexOf('/en/') === 0;
  try {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.lang-switch');
      if (a) localStorage.setItem('mp_lang', a.getAttribute('data-lang'));
    });

    if (isEn || localStorage.getItem('mp_lang') || localStorage.getItem('mp_lang_hint')) return;
    var ua = navigator.userAgent || '';
    if (/bot|crawl|spider|slurp|lighthouse|headless/i.test(ua)) return;
    var prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    var first = String(prefs[0] || '').toLowerCase();
    var hasDutch = prefs.some(function (l) { return String(l).toLowerCase().indexOf('nl') === 0; });
    if (first.indexOf('en') !== 0 || hasDutch) return;

    function showHint() {
      var sw = document.querySelector('a.lang-switch[data-lang="en"]');
      if (!sw) return;
      var bar = document.createElement('div');
      bar.className = 'lang-hint';
      bar.setAttribute('role', 'region');
      bar.setAttribute('lang', 'en');
      var text = document.createElement('span');
      text.textContent = 'This page is also available in English.';
      var go = document.createElement('a');
      go.href = sw.getAttribute('href');
      go.textContent = 'Switch to English';
      go.addEventListener('click', function () { try { localStorage.setItem('mp_lang', 'en'); } catch (e) {} });
      var close = document.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '✕';
      close.addEventListener('click', function () {
        try { localStorage.setItem('mp_lang_hint', 'dismissed'); } catch (e) {}
        bar.remove();
      });
      bar.appendChild(text);
      bar.appendChild(go);
      bar.appendChild(close);
      document.body.insertBefore(bar, document.body.firstChild);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showHint); else showHint();
  } catch (e) { /* storage blocked, the URL still decides the language */ }
})();
