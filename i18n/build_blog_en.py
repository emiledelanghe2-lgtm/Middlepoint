# -*- coding: utf-8 -*-
"""Builds the English blog (public/en/blog/) from blog_articles_en.py.
Layout, header and styles are taken from the Dutch blog and the English why.html."""
import os, re, html, json
from blog_articles_nl import ARTICLES as NL
from blog_articles_en import ARTICLES_EN as EN

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, '..', 'public')
OUT = os.path.join(SITE, 'en', 'blog')
os.makedirs(OUT, exist_ok=True)

why = open(os.path.join(SITE, 'en', 'why.html'), encoding='utf-8').read()
nl_index = open(os.path.join(SITE, 'blog', 'index.html'), encoding='utf-8').read()
CSS = re.search(r'<style>(.*?)</style>', nl_index, re.S).group(1)
hdr = re.search(r'<header class="nav-bar">.*?</header>', why, re.S).group(0)
hdr = re.sub(r'\s*<a href="/en/mijn-gesprekken.html" id="authStatus".*?</a>', '', hdr, flags=re.S)
hdr = hdr.replace(' class="current" aria-current="page"', '')
toggle = re.search(r'<script>\s*\(function\(\) \{\s*const toggle.*?</script>', why, re.S).group(0)
GTAG = re.search(r'<!-- Google tag.*?</script>\s*<script>.*?</script>', why, re.S).group(0)
DATE = '2026-10-20'
DATE_TXT = 'October 20, 2026'

SAFE = ('<div class="safe"><strong>Please note.</strong> Is this about violence, threats or fear of the other person? '
        'Then an online conversation is not the right place. In the US you can call the National Domestic Violence Hotline for free at 1-800-799-7233, '
        'and in the UK the National Domestic Abuse Helpline at 0808 2000 247. In Flanders you can call 1712 for free. '
        'In case of immediate danger, call 911 (US), 999 (UK) or 112 (Europe).</div>')
CTA = ('<div class="cta-box"><h3>Can you no longer talk it through?</h3>'
       '<p>At Middlepoint everyone answers the same focused questionnaire separately. You get one clear overview of how you each see the other\'s side, and a follow-up document that grows with you. No pressure and no direct contact while you answer. It is a complement to a therapist, not a replacement.</p>'
       '<a href="/en/new.html" class="btn clay">Start a conversation</a></div>')
FOOT = """<footer class="footer">
  <p style="margin:0 0 8px;font-size:1rem;color:var(--ink)">The place to find each other again.</p>
  <p style="margin:0 0 16px;font-size:.82rem">
    Questions? <a href="mailto:middlepoint@zohomail.eu">middlepoint@zohomail.eu</a>
    &nbsp;·&nbsp; <a href="/en/blog/">Blog</a>
    &nbsp;·&nbsp; <a href="/en/login.html">My conversations</a>
    &nbsp;·&nbsp; <a href="/en/privacy.html">Privacy policy</a>
  </p>
  <a href="/en/faq.html" class="hint-chip" style="text-decoration:none">Frequently asked questions</a>
</footer>"""

def page(slug_en, slug_nl, title, desc, body, jsonld=''):
    url = f'https://middlepoint.net/en/blog/{slug_en}' if slug_en else 'https://middlepoint.net/en/blog/'
    nl_url = f'https://middlepoint.net/blog/{slug_nl}' if slug_nl else 'https://middlepoint.net/blog/'
    nl_path = f'/blog/{slug_nl}' if slug_nl else '/blog/'
    t = html.escape(title); d = html.escape(desc, quote=True)
    en_path = f'/en/blog/{slug_en}' if slug_en else '/en/blog/'
    sw = ('<div class="lang-switch" role="group" aria-label="Taal / Language">'
          f'<a href="{nl_path}" data-lang="nl" hreflang="nl" lang="nl" title="Nederlands">NL</a>'
          f'<a href="{en_path}" data-lang="en" hreflang="en" lang="en" title="English" aria-current="true">EN</a></div>')
    h = re.sub(r'<div class="lang-switch".*?</div>', lambda m: sw, hdr, flags=re.S)
    return f"""<!DOCTYPE html>
<html lang="en">
  {GTAG}
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<title>{t} | Middlepoint</title>
<meta name="description" content="{d}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="https://middlepoint.net/og-image.jpg">
<meta property="og:type" content="article">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="nl" href="{nl_url}">
<link rel="alternate" hreflang="en" href="{url}">
<link rel="alternate" hreflang="x-default" href="{nl_url}">
<link rel="stylesheet" href="/style.css">
<script src="/lang.js"></script>
<style>{CSS}</style>
{jsonld}
</head>
<body>
{h}
{toggle}
{body}
{FOOT}
</body>
</html>
"""

by = {a['slug']: a for a in EN}
for a, nl in zip(EN, NL):
    secs = ''
    for h, paras in a['sections']:
        secs += f'<h2>{html.escape(h)}</h2>\n' + ''.join(f'<p>{html.escape(p)}</p>\n' for p in paras)
    rel = ''.join(f'<a href="/en/blog/{s}.html">{html.escape(by[s]["title"])}</a>' for s in a['related'])
    body = (f'<article class="blog"><span class="label">{html.escape(a["tag"])}</span>'
            f'<h1>{html.escape(a["title"])}</h1><div class="meta">Written by the Middlepoint team, {DATE_TXT}.</div>'
            f'<p class="lead">{html.escape(a["lead"])}</p>{secs}{SAFE}{CTA}'
            f'<div class="related"><strong>Read also</strong>{rel}</div></article>')
    ld = ('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":%s,"description":%s,'
          '"datePublished":"%s","dateModified":"%s","inLanguage":"en","author":{"@type":"Organization","name":"Middlepoint"},'
          '"publisher":{"@type":"Organization","name":"Middlepoint","url":"https://middlepoint.net/"},'
          '"mainEntityOfPage":"https://middlepoint.net/en/blog/%s.html"}</script>') % (
          json.dumps(a['title'], ensure_ascii=False), json.dumps(a['desc'], ensure_ascii=False), DATE, DATE, a['slug'])
    open(f"{OUT}/{a['slug']}.html", 'w', encoding='utf-8').write(
        page(a['slug'] + '.html', nl['slug'] + '.html', a['title'], a['desc'], body, ld))

cards = ''.join(f'<a class="post" href="/en/blog/{a["slug"]}.html"><span class="label">{html.escape(a["tag"])}</span>'
                f'<h2>{html.escape(a["title"])}</h2><p>{html.escape(a["desc"])}</p></a>' for a in EN)
body = ('<section class="blog"><span class="label">Blog</span><h1>Arguments and conflicts, honestly explained</h1>'
        '<p class="lead">Practical tips for talking calmly after an argument, with partners, family, friends and coworkers.</p>'
        f'<div class="posts">{cards}</div>{CTA}</section>')
open(OUT + '/index.html', 'w', encoding='utf-8').write(
    page('', '', 'Blog about arguments and conflicts', 'Practical tips to resolve an argument with your partner, family, friends or coworker. Simple steps and example phrases.', body))
print('English blog built:', len(EN) + 1, 'pages')
