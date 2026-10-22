# Engelse versie van Middlepoint

De Nederlandse pagina's in `public/` zijn de bron. De Engelse pagina's in `public/en/` worden daaruit gegenereerd, ze niet met de hand aanpassen.

Na elke wijziging aan een Nederlandse pagina:

```bash
python3 i18n/build_en.py          # genereert public/en/*.html (stopt als een Nederlandse zin niet meer gevonden wordt)
python3 i18n/build_blog_en.py     # genereert public/en/blog/
python3 i18n/patch_nl.py          # zet hreflang, lang.js en de EN-knop op de Nederlandse pagina's
python3 i18n/build_sitemap.py     # sitemap met hreflang
python3 i18n/check_dutch.py       # lijst met resterend Nederlands in public/en
```

- `translations.py`: per pagina een lijst `(Nederlands, Engels)` met exacte tekstvervangingen. `story_phrases.py`: de vragenlijst van story.html.
- `blog_articles_nl.py` en `blog_articles_en.py`: de zes blogartikelen in beide talen.
- Taal van een gesprek of reflectie staat in `sessions.lang` en `reflections.lang` (migration-009-language.sql). Nederlands is de standaard en wordt niet weggeschreven.
- Backend: `functions/_lang.js` (taalhulpjes), `functions/_prompts-en.js` (Engelse AI-prompts). Mails, links en AI-output volgen de taal van het gesprek.
