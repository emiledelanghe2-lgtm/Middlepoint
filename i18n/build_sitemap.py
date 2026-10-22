# -*- coding: utf-8 -*-
"""Adds the English pages to public/sitemap.xml with hreflang alternates. Safe to run repeatedly."""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from blog_articles_nl import ARTICLES as NL
from blog_articles_en import ARTICLES_EN as EN
PUB = os.path.join(HERE, '..', 'public')
path = os.path.join(PUB, 'sitemap.xml')
sm = open(path, encoding='utf-8').read()

# Start from the Dutch entries only (drop earlier English entries and earlier alternates).
sm = re.sub(r'\s*<url>\s*<loc>https://middlepoint.net/en/.*?</url>', '', sm, flags=re.S)
sm = re.sub(r'\s*<xhtml:link[^>]*/>', '', sm)
sm = sm.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">')

# Dutch page -> English twin
pairs = {}
en_dir = os.path.join(PUB, 'en')
for root, _, files in os.walk(en_dir):
    for f in files:
        if not f.endswith('.html'):
            continue
        rel = os.path.relpath(os.path.join(root, f), en_dir)
        pairs[rel] = rel
for e, n in zip(EN, NL):
    pairs.pop('blog/%s.html' % e['slug'], None)
    pairs['blog/%s.html' % e['slug']] = 'blog/%s.html' % n['slug']   # en rel -> nl rel
# note: for all other pages the English and the Dutch relative path are the same

def clean(r):
    return r[:-10] if r.endswith('index.html') else r

def url_for(rel, en):
    return 'https://middlepoint.net/' + ('en/' if en else '') + clean(rel)

# Only pages that the Dutch sitemap lists get an English entry (no app pages like story.html).
dutch_locs = set(re.findall(r'<loc>(.*?)</loc>', sm))
pairs = {e: n for e, n in pairs.items() if url_for(n, False) in dutch_locs}
nl_to_en = {}
for en_rel, nl_rel in pairs.items():
    nl_to_en[nl_rel] = en_rel

def alt_block(nl_rel, en_rel):
    return ('    <xhtml:link rel="alternate" hreflang="nl" href="%s"/>\n'
            '    <xhtml:link rel="alternate" hreflang="en" href="%s"/>\n') % (url_for(nl_rel, False), url_for(en_rel, True))

# Add alternates to the Dutch entries that have an English twin
def add_alt(m):
    block = m.group(0)
    loc = re.search(r'<loc>(.*?)</loc>', block).group(1)
    for nl_rel, en_rel in nl_to_en.items():
        if loc == url_for(nl_rel, False):
            return block.replace('</loc>\n', '</loc>\n' + alt_block(nl_rel, en_rel), 1)
    return block
sm = re.sub(r'<url>.*?</url>', add_alt, sm, flags=re.S)

# English entries
DATE = '2026-10-22'
add = ''
for en_rel, nl_rel in sorted(pairs.items()):
    prio = '0.9' if en_rel == 'index.html' else '0.7'
    add += ('  <url>\n    <loc>%s</loc>\n%s    <lastmod>%s</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>%s</priority>\n  </url>\n'
            % (url_for(en_rel, True), alt_block(nl_rel, en_rel), DATE, prio))
sm = sm.replace('</urlset>', add + '</urlset>')
open(path, 'w', encoding='utf-8').write(sm)
print('sitemap: %d urls' % sm.count('<url>'))
