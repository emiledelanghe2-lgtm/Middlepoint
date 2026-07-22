const { getSupabase } = require('./_supabase');
const { emailButtonHtml } = require('./_email-button');

async function callClaude(systemPrompt, userPrompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API fout (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.content.map(b => b.text || '').join('\n');
}

async function sendSelfHelpReadyEmail(toEmail, toName, link) {
  if (!process.env.RESEND_API_KEY || !toEmail) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Middlepoint <onboarding@resend.dev>',
        to: toEmail,
        subject: 'Jouw persoonlijke handvaten staan klaar',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p>Je concrete stappen en handvaten staan klaar.</p>
            ${emailButtonHtml(link, 'Bekijk mijn handvaten')}
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon selfhelp-klaar-mail niet versturen:', err);
  }
}

async function sendAdminSelfHelpFailureAlert(reflectionId, errorMessage) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Middlepoint <onboarding@resend.dev>',
        to: 'middlepoint@zohomail.eu',
        subject: `Selfhelp generatie mislukt, reflectie ${reflectionId}`,
        html: `<p>Reflectie: ${reflectionId}</p><p>Fout: ${errorMessage}</p>`,
      }),
    });
  } catch (err) {
    console.error('Kon admin-alertmail (selfhelp) niet versturen:', err);
  }
}

exports.handler = async (event) => {
  let reflectionId;
  try {
    ({ reflectionId } = JSON.parse(event.body || '{}'));
    const supabase = getSupabase();
    const { data: reflection } = await supabase.from('reflections').select('*').eq('id', reflectionId).single();
    if (!reflection) return { statusCode: 404, body: JSON.stringify({ error: 'Reflectie niet gevonden.' }) };

    const systemPrompt = `Je bent een warme, motiverende coach die concrete, uitvoerbare handvaten geeft. Je kreeg al eerder een reflectie geschreven over deze situatie (categorie: "${reflection.category}"), en de persoon heeft nu betaald voor extra, concrete hulp om er zelf mee aan de slag te gaan.

BELANGRIJK: dit gaat NIET over een gesprek met de andere persoon, dat blijft apart. Dit gaat puur over wat de persoon zelf, alleen, kan doen.

BEKNOPTHEID: schrijf compact, korte zinnen per punt.

NOOIT AANNAMES OVER GESLACHT OF GEAARDHEID: veronderstel nooit het geslacht, de genderidentiteit, of de geaardheid van de betrokken personen, enkel op basis van een naam of categorie. Gebruik neutrale bewoordingen tenzij de persoon zelf expliciet een geslacht of voornaamwoord vermeldde.

Bouw je antwoord met exact deze onderdelen:
0. key_points: 2 tot 3 heel korte bullet-punten (elk maximaal 12 woorden) die het actieplan samenvatten.
1. deeper_layer: een scherpere, verdiepte versie van de eerdere analyse. VERBODEN: herhaal nooit gewoon wat de persoon al zei of wat in de eerdere reflectie al stond, in andere woorden. VERBODEN ook: een conclusie trekken die niet expliciet steunt op wat de persoon in de nieuwe antwoorden zei. Verbind in plaats daarvan de eerdere analyse expliciet met de NIEUWE antwoorden die de persoon net gaf (wat ze willen bereiken, wat hen tegenhoudt, hoe ze willen dat het er over een maand uitziet), tot een inzicht dat nog nergens zo werd benoemd, en verwijs letterlijk naar welk nieuw antwoord je conclusie draagt. Als de nieuwe antwoorden te beperkt zijn om echt iets nieuws te zeggen, zeg dat dan eerlijk in plaats van iets te verzinnen. Wees concreet en durf te benoemen wat je ziet, ook als het confronterend is. 3 tot 5 zinnen.
2. steps: 3 tot 5 concrete, uitvoerbare stappen, in logische volgorde, die de persoon effectief kan zetten. Elke stap specifiek en toepasbaar, geen vage adviezen zoals "denk hier eens over na". Baseer elke stap op iets specifieks dat DEZE persoon aangaf (hun situatie, hun antwoorden op wat ze willen bereiken en wat hen tegenhoudt), niet op generieke stappen die bij iedereen zouden passen.
3. tips: 2 tot 4 losse, praktische handvaten, dingen die de persoon in het dagelijks leven kan toepassen wanneer een gelijkaardige situatie zich weer voordoet. VERMIJD GENERIEKE, VEELGEBRUIKTE ADVIEZEN zoals "schrijf het op in een dagboek", "neem een moment voor jezelf", "adem diep", of "praat erover met een vriend", tenzij dat echt specifiek en concreet is toegespitst op deze exacte situatie. Bedenk liever iets dat rechtstreeks aansluit bij wat deze persoon specifiek beschreef.
4. exercises: 1 tot 2 korte, concrete oefeningen die de persoon nu of deze week kan doen, met duidelijke instructies, specifiek toegespitst op hun situatie, niet een generieke oefening die bij elk probleem zou passen.
5. closing: een korte, oprecht motiverende afsluitende boodschap, die de persoon moed inspreekt, zonder overdreven of clichématig te klinken. 2 tot 3 zinnen.
6. quote: een korte, toepasselijke quote. Gebruik enkel een quote van een gekende, lang overleden denker (zoals Marcus Aurelius, Seneca, Rumi) of schrijf zelf een korte, krachtige uitspraak. Nooit een songtekst, nooit een citaat van een nog levende of recent overleden persoon.

Je toon is warm en menselijk, geen kil rapport. Gebruik nooit het lange streepje.

EMPATHIE BIJ ZWARE SITUATIES: als de situatie ziekte, overlijden of een zwaar verlies betreft, toon dan oprechte betrokkenheid in je toon, zonder dat het overdreven of geforceerd aanvoelt.
Antwoord alleen met geldige JSON, geen andere tekst:
{
  "key_points": ["...", "..."],
  "deeper_layer": "...",
  "steps": ["...", "...", "..."],
  "tips": ["...", "..."],
  "exercises": ["...", "..."],
  "closing": "...",
  "quote": "..."
}`;

    const userPrompt = `Oorspronkelijke antwoorden:\n${reflection.raw_content}\n\nEerdere reflectie, situatie: ${reflection.situation_summary}\n\nEerdere reflectie, onderliggende laag: ${reflection.deeper_layer}\n\nExtra antwoorden na betaling:\n${reflection.self_help_answers}\n\nGeef je antwoord in het gevraagde JSON-formaat, in het Nederlands.`;

const aiResponse = await callClaude(systemPrompt, userPrompt, 2500);
    const cleaned = aiResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const selfHelpTips = parsed.tips || [];
    if (reflection.recommendation === 'gesprek' || reflection.recommendation === 'twijfel') {
      selfHelpTips.push('Tip: overweeg ook een gesprek met de ander, zie onderaan deze pagina.');
    }

    await supabase.from('reflections').update({
      self_help_key_points: parsed.key_points || [],
      self_help_tips: selfHelpTips,
      self_help_deeper_layer: parsed.deeper_layer,
      self_help_steps: parsed.steps,
      self_help_exercises: parsed.exercises,
      self_help_closing: parsed.closing,
      self_help_quote: parsed.quote,
      self_help_status: 'klaar',
    }).eq('id', reflectionId);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    await sendSelfHelpReadyEmail(reflection.email, reflection.name, `${siteUrl}/reflectie.html?token=${reflection.access_token}`);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    try {
      const supabase = getSupabase();
      await supabase.from('reflections').update({ self_help_status: 'mislukt' }).eq('id', reflectionId);
      sendAdminSelfHelpFailureAlert(reflectionId, err.message);
    } catch (e) {}
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
