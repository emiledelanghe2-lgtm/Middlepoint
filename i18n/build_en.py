# -*- coding: utf-8 -*-
"""Generates public/en/*.html from the Dutch pages using exact string replacements.
Usage: python3 i18n/build_en.py
Every Dutch source string must exist in the page, otherwise the build stops, so that
no translation silently goes missing."""
import os, re, sys, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, '..', 'public')
sys.path.insert(0, HERE)

COMMON = [
 ('<html lang="nl">', '<html lang="en">'),
 ('aria-label="Hoofdnavigatie"', 'aria-label="Main navigation"'),
 ('aria-label="Menu openen"', 'aria-label="Open menu"'),
 ('>Waarom Middlepoint<', '>Why Middlepoint<'),
 ('>Prijzen<', '>Pricing<'),
 ('>Getuigenissen<', '>Testimonials<'),
 ('>Voor bedrijven<', '>For business<'),
 ('>Mijn gesprekken<', '>My conversations<'),
 ('title="Mijn gesprekken"', 'title="My conversations"'),
 ('>Inloggen / Registreren<', '>Log in / Sign up<'),
 ('>Start een gesprek<', '>Start a conversation<'),
 ('De plek om elkaar terug te vinden.', 'The place to find each other again.'),
 ('Vragen of feedback?', 'Questions or feedback?'),
 ('Vragen?', 'Questions?'),
 ('>Privacybeleid<', '>Privacy policy<'),
 ('>Veelgestelde vragen<', '>Frequently asked questions<'),
]
OPTIONAL = {  # replaced when present, no error if absent
 'og:locale" content="nl_BE"': 'og:locale" content="en_US"',
}

def link_en(html):
    """Point internal page links to /en/ and keep assets, functions and mailto untouched."""
    def fix(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith('/.netlify') or url.startswith('//'):
            return m.group(0)
        if url == '/':
            return f'{attr}="/en/"'
        if url.startswith('/blog/') or url == '/blog':
            return f'{attr}="/en{url}"'
        if re.match(r'^/[A-Za-z0-9_\-]+\.html', url):
            return f'{attr}="/en{url}"'
        return m.group(0)
    return re.sub(r'(href|action)="(/[^"]*)"', fix, html)

PAGE_NAMES = sorted(f[:-5] for f in os.listdir(PUB) if f.endswith('.html'))
def link_js(html):
    """Point page URLs inside script string literals ('/new.html', "/story.html?x") to /en/."""
    # A literal that follows a '+ ' is the tail of a path that already carries its own language prefix.
    pat = r'(?<!\+ )([\'"`])/(' + '|'.join(re.escape(n) for n in PAGE_NAMES) + r')\.html'
    return re.sub(pat, r'\1/en/\2.html', html)

def strip_lang_markup(s):
    """The Dutch twins carry hreflang links, lang.js and an EN switch (added by patch_nl.py). Remove them so the English page gets its own."""
    s = re.sub(r'<link rel="alternate" hreflang="[^"]*" href="[^"]*">\n', '', s)
    s = s.replace('<script src="/lang.js"></script>\n', '')
    s = re.sub(r'\n[ ]*<a href="[^"]*" class="lang-switch"[^>]*>EN</a>', '', s)
    return s

def build(page, rules):
    src_path = os.path.join(PUB, page)
    out_path = os.path.join(PUB, 'en', page)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    s = strip_lang_markup(open(src_path, encoding='utf-8').read())
    missing = []
    for nl, en in COMMON:
        if nl in s:
            s = s.replace(nl, en)
    for nl, en in OPTIONAL.items():
        s = s.replace(nl, en)
    for nl, en in rules:
        if nl not in s:
            missing.append(nl[:90])
        s = s.replace(nl, en)
    s = link_en(s)
    s = link_js(s)
    # canonical, og:url, hreflang
    rel = page[:-10] if page.endswith('index.html') else page
    nl_url = 'https://middlepoint.net/' + rel
    en_url = 'https://middlepoint.net/en/' + rel
    s = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{en_url}">', s)
    s = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{en_url}">', s)
    alt = (f'<link rel="alternate" hreflang="nl" href="{nl_url}">\n'
           f'<link rel="alternate" hreflang="en" href="{en_url}">\n'
           f'<link rel="alternate" hreflang="x-default" href="{nl_url}">\n')
    s = s.replace('<link rel="stylesheet" href="/style.css">', alt + '<link rel="stylesheet" href="/style.css">\n<script src="/lang.js"></script>', 1)
    # language switch (shows NL)
    nl_href = '/' + rel
    s = s.replace('<div class="nav-actions">', f'<div class="nav-actions">\n    <a href="{nl_href}" class="lang-switch" data-lang="nl" hreflang="nl" lang="nl" title="Nederlands">NL</a>', 1)
    open(out_path, 'w', encoding='utf-8').write(s)
    return missing

def main():
    only = sys.argv[1:] 
    import translations
    importlib.reload(translations)
    bad = False
    for page, rules in translations.PAGES.items():
        if only and page not in only:
            continue
        miss = build(page, rules)
        print(('OK   ' if not miss else 'MISS ') + page, f'({len(rules)} rules)')
        for m in miss:
            print('     missing:', m)
            bad = True
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
