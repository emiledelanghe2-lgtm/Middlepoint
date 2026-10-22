# -*- coding: utf-8 -*-
"""Adds hreflang, lang.js and the EN switcher to the Dutch pages that have an English twin."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
PUB = os.path.join(HERE, '..', 'public')
from blog_articles_nl import ARTICLES as NL
from blog_articles_en import ARTICLES_EN as EN
# English blog slug -> Dutch blog slug
EN2NL = {'blog/%s.html' % e['slug']: 'blog/%s.html' % n['slug'] for e, n in zip(EN, NL)}

def twin_pages():
    out = []
    en = os.path.join(PUB, 'en')
    for root, _, files in os.walk(en):
        for f in files:
            if f.endswith('.html'):
                out.append(os.path.relpath(os.path.join(root, f), en))
    return sorted(out)

for en_rel in twin_pages():
    nl_rel = EN2NL.get(en_rel, en_rel)
    p = os.path.join(PUB, nl_rel)
    if not os.path.exists(p):
        continue
    s = open(p, encoding='utf-8').read()
    def clean(r): return r[:-10] if r.endswith('index.html') else r
    nl_url = 'https://middlepoint.net/' + clean(nl_rel)
    en_url = 'https://middlepoint.net/en/' + clean(en_rel)
    if 'hreflang="en"' not in s:
        alt = (f'<link rel="alternate" hreflang="nl" href="{nl_url}">\n'
               f'<link rel="alternate" hreflang="en" href="{en_url}">\n'
               f'<link rel="alternate" hreflang="x-default" href="{nl_url}">\n')
        s = s.replace('<link rel="stylesheet" href="/style.css">', alt + '<link rel="stylesheet" href="/style.css">\n<script src="/lang.js"></script>', 1)
    if 'class="lang-switch"' not in s:
        s = s.replace('<div class="nav-actions">', f'<div class="nav-actions">\n    <a href="/en/{clean(en_rel)}" class="lang-switch" data-lang="en" hreflang="en" lang="en" title="English">EN</a>', 1)
    open(p, 'w', encoding='utf-8').write(s)
    print('patched', nl_rel)
