# -*- coding: utf-8 -*-
"""Lists lines in public/en/**/*.html that still look Dutch (visible text and string literals).
Code comments and identifiers are ignored on a best effort basis."""
import os, re, sys
PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'en')
STOP = set('de het een en van voor met niet je jij jouw ik mijn wij jullie wordt worden zijn heeft hebben dat dit deze die als maar ook nog naar over bij uit door kan kun zal wil moet zonder tussen alle elk elke meer wat hoe waar wanneer gesprek gesprekken'.split())
# words that are also English and must not count
AMBIGUOUS = {'over', 'die', 'dan', 'was', 'also', 'me', 'her', 'is', 'men', 'door', 'bij', 'kan', 'wil', 'zal', 'uit', 'in', 'of', 'on', 'an', 'am'}
STOP -= AMBIGUOUS
bad = 0
for root, _, files in os.walk(PUB):
    for f in sorted(files):
        if not f.endswith('.html'):
            continue
        path = os.path.join(root, f)
        rel = os.path.relpath(path, PUB)
        hits = []
        for n, line in enumerate(open(path, encoding='utf-8'), 1):
            t = line.strip()
            if t.startswith('//') or t.startswith('/*') or t.startswith('*') or t.startswith('<!--'):
                continue
            t = re.sub(r'(href|src|action|id|class|name|value|data-[a-z-]+|for|type|style|hreflang|lang)="[^"]*"', '', t)
            t = re.sub(r'https?://\S+', '', t)
            words = re.findall(r"[A-Za-z']+", t.lower())
            found = [w for w in words if w in STOP]
            if len(found) >= 2 or (found and len(words) <= 6):
                hits.append((n, found, line.strip()[:140]))
        if hits:
            print(f'--- {rel}: {len(hits)} suspicious lines')
            for n, found, l in hits[:12]:
                print(f'   {n}: {sorted(set(found))} | {l}')
            bad += len(hits)
print('total suspicious lines:', bad)
