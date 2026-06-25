# Middlepoint — Setup

## 1. Database aanmaken
1. Open je Supabase project → **SQL Editor** → **New query**
2. Plak de inhoud van `schema.sql` en klik **Run**

## 2. Environment variables op Netlify
Ga naar je Netlify site → **Site configuration → Environment variables**, en voeg toe:

| Naam | Waarde | Waar te vinden |
|---|---|---|
| `SUPABASE_URL` | `https://uhpafymwenrmqgyunpuy.supabase.co` | Je had deze al |
| `SUPABASE_SERVICE_ROLE_KEY` | (lange sleutel, begint met `sb_secret_...`) | Supabase → Project Settings → API → **Secret keys** |
| `ANTHROPIC_API_KEY` | (jouw Claude API key) | console.anthropic.com → API Keys |

## 3. Deployen via GitHub
Upload deze map naar een GitHub-repository, en koppel die repository aan je Netlify-project (Project configuration → Build & deploy → Link repository). Netlify herkent automatisch `netlify.toml`.

## 4. Testen
1. Ga naar `/new.html`, maak een testsessie aan met 2 namen
2. Open beide gegenereerde links (2 verschillende browsers/incognito)
3. Vul bij beide een verhaal in → wacht 1-2 min → vervolgvragen verschijnen
4. Vul bij beide de vervolgvragen in → wacht 1-2 min → document op `/document.html`

## Nog niet gebouwd
- Automatische e-mailnotificaties
- Live chatbot-variant
- Geboortedatum/astrologie (bewust niet gebouwd)
