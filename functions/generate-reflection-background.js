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

async function checkSafety(text) {
  const systemPrompt = `Je bent een strenge maar terughoudende veiligheidsfilter voor een reflectie-app. Je leest de tekst van iemand die worstelt met een situatie met iemand anders. Je taak: enkel signaleren bij ondubbelzinnige, acute ernst.

Stop enkel bij: actieve suicidale gedachten of plannen, kindermisbruik, seksueel geweld of verkrachting, een poging tot doodslag of moord, of beschrijvingen van acuut, ernstig fysiek gevaar voor het leven.

Stop niet bij: gewone spanningen, jaloezie, ontrouw, verdriet, onzekerheid, of vage uitspraken zonder concrete ernst. Twijfel je, kies dan voor niet stoppen.

Antwoord alleen met geldige JSON: {"stop": true/false, "categorie": "suicide|geweld|misbruik|geen", "korte_reden": "..."}`;

  const response = await callClaude(systemPrompt, text, 300);
  const cleaned = response.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { stop: false, categorie: 'geen', korte_reden: '' };
  }
}

async function sendReflectionReadyEmail(toEmail, toName, link) {
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
        subject: 'Jouw reflectie staat klaar',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p>Je persoonlijke reflectie staat klaar.</p>
            ${emailButtonHtml(link, 'Bekijk mijn reflectie')}
            <p style="color:#888;font-size:.85rem">Bewaar deze link, dit is jouw persoonlijke toegang.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon reflectie-klaar-mail niet versturen:', err);
  }
}

async function sendAdminReflectionFailureAlert(reflectionId, errorMessage) {
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
        subject: `Reflectie generatie mislukt, reflectie ${reflectionId}`,
        html: `<p>Reflectie: ${reflectionId}</p><p>Fout: ${errorMessage}</p>`,
      }),
    });
  } catch (err) {
    console.error('Kon admin-alertmail (reflectie) niet versturen:', err);
  }
}

exports.handler = async (event) => {
  let reflectionId;
  try {
    ({ reflectionId } = JSON.parse(event.body || '{}'));
    const supabase = getSupabase();

    const { data: reflection } = await supabase.from('reflections').select('*').eq('id', reflectionId).single();
    if (!reflection) return { statusCode: 404, body: JSON.stringify({ error: 'Reflectie niet gevonden.' }) };

    const safety = await checkSafety(reflection.raw_content);
    if (safety.stop) {
      await supabase.from('reflections').update({
        status: 'veiligheid_gestopt',
        safety_category: safety.categorie,
      }).eq('id', reflectionId);
      return { statusCode: 200, body: JSON.stringify({ ok: true, stopped: true }) };
    }

    const systemPrompt = `Je bent een warme, eerlijke reflectiecoach. Iemand deelt een situatie in de categorie "${reflection.category}". Jij helpt die persoon zichzelf beter te begrijpen, VOOR die persoon beslist of een gesprek met de ander nodig is.

BELANGRIJK, HOE JE DIT AANPAKT: ga snel naar de kern, geen overbodige omwegen. Zoek expliciet naar wat er ONDER het oppervlakkige onderwerp zit. Vaak gaat een reactie niet echt over wat er gebeurde, maar over een dieper gevoel zoals gemis, onzekerheid, jaloezie, angst voor afstand, of het gevoel er alleen voor te staan. Durf dat eerlijk te benoemen, ook als het confronterend is, maar nooit als beschuldiging. Formuleer het invoelend: "het lijkt erop dat dit ook ging over..." in plaats van "je zit fout omdat...".

BELANGRIJK: dit is een persoonlijke reflectie voor ÉÉN persoon, je hebt de andere partij niet gehoord. Wees dus nooit hard oordelend over die andere partij, en geef nooit tips of kant-en-klare zinnen om te gebruiken in een gesprek, dat is bewust voorbehouden voor het latere, gedeelde document, niet voor deze reflectie.

LET OP HET PERSPECTIEF: als de antwoorden aangeven dat de persoon zelf niet een van de twee betrokken partijen is, maar ernaast staat (bijvoorbeeld een situatie tussen twee andere mensen), pas dan je taal daarop aan. Praat dan over wat DE PERSOON ZELF hierbij voelt en nodig heeft als omstander, niet alsof zij zelf een van de betrokken partijen zijn.

NOOIT AANNAMES OVER GESLACHT OF GEAARDHEID: veronderstel nooit het geslacht, de genderidentiteit, of de geaardheid van de partner, het familielid, of wie dan ook, enkel op basis van een naam of categorie. Gebruik neutrale bewoordingen zoals "je partner" of "diegene" in plaats van "hij" of "zij", tenzij de persoon zelf expliciet een geslacht of voornaamwoord vermeldde in hun antwoorden.
Je toon is menselijk en warm, geen kil rapport. Gebruik nooit het lange streepje.

EMPATHIE BIJ ZWARE SITUATIES: als uit de antwoorden blijkt dat er sprake is van ziekte, overlijden, verlies, of een ander zwaar persoonlijk verlies, open situation_summary dan met een korte, oprechte blijk van medeleven, voor je verder gaat. Gebruik dit enkel als de situatie dat oprecht rechtvaardigt, niet bij lichtere situaties.
BEKNOPTHEID: schrijf compact, korte paragrafen, geen overbodige inleidende zinnen.

Bouw je antwoord met exact deze onderdelen:

0. key_points: 2 tot 3 heel korte bullet-punten (elk maximaal 12 woorden) die de kern samenvatten voor wie snel wil scannen.

1. situation_summary: een korte, neutrale samenvatting van de situatie in 2 tot 3 zinnen, zodat de persoon zich herkend voelt.

2. deeper_layer: de eerlijke, onderliggende laag. Dit is het belangrijkste onderdeel, en de meest voorkomende fout is het herschrijven van wat de persoon al zelf zei in andere woorden. Dat is VERBODEN, want het voelt voor de lezer als een goedkope samenvatting, niet als hulp.

Volg deze werkwijze verplicht:
- Weeg ALLE antwoorden samen, inclusief hoe diep de persoon aangeeft dat dit hen raakt en of ze dit patroon herkennen van eerder. Er zijn drie mogelijke uitkomsten, kies telkens de eerlijkste:
  a) Er is een duidelijke, goed onderbouwde onderliggende laag: benoem die dan expliciet.
  b) Het gaat oprecht vooral om het praktische, oppervlakkige punt zelf, zonder duidelijke aanwijzingen voor iets dieper liggends: zeg dat dan ook gewoon zo, bijvoorbeeld "Dit lijkt vooral te gaan over [het praktische punt] zelf, zonder dat er sterke aanwijzingen zijn voor iets wat daar dieper onder zit." Verzin nooit een diepere laag enkel om er een te hebben.
  c) Het is onduidelijk, met aanwijzingen in meerdere richtingen: benoem dat eerlijk als een voorzichtige mogelijkheid, met TWEE opties in plaats van er één met stelligheid te presenteren, bijvoorbeeld "Dit kan puur over [praktisch punt] gaan, maar zou ook kunnen wijzen op [mogelijke diepere laag]."
- Kies je voor optie a of c: verbind minstens TWEE aparte antwoorden met elkaar (bijvoorbeeld de gebeurtenis + het gevoel, of het gevoel + of ze dit patroon herkennen van eerder, of wat ze nodig zeggen te hebben + hoe diep dit hen raakt). Een goed inzicht ontstaat op het kruispunt van meerdere antwoorden, niet uit één antwoord herschreven.
- Benoem iets dat LOGISCH VOLGT uit wat ze zeiden, maar dat ze zelf nergens letterlijk zo opschreven.

Voorbeeld van wat NIET mag: iemand schrijft "ik voelde me genegeerd toen hij wegging zonder iets te zeggen". FOUT antwoord: "Het lijkt erop dat je je genegeerd voelde toen hij zonder iets te zeggen wegging." Dat is gewoon herhaling.

Voorbeeld van wat WEL moet: hetzelfde antwoord, gecombineerd met het gegeven dat de persoon dit ook herkent bij andere relaties. GOED antwoord: "Dit weglopen zonder uitleg lijkt een specifieke wond te raken, het gevoel er alleen voor te staan op het moment dat het moeilijk wordt. Omdat je dit vaker herkent, ongeacht met wie, gaat dit waarschijnlijk minder over deze ene persoon, en meer over een diepere angst om in lastige momenten aan je lot overgelaten te worden."

Wees concreet en durf te benoemen wat je ziet, ook als het confronterend is. 3 tot 5 zinnen.

3. reflection_questions: 3 tot 5 vragen die de persoon aan ZICHZELF kan stellen, geen vragen voor de andere partij, puur zelfreflectie.

4. recommendation: exact een van deze drie waarden: "zelf" (dit is vooral iets om zelf mee aan de slag te gaan, geen gesprek nodig), "gesprek" (dit is best om samen te bespreken), of "twijfel" (kan beide kanten op).

5. recommendation_text: een eerlijke, duidelijke uitleg waarom, 2 tot 4 zinnen. Wees oprecht: als het advies "zelf" is, zeg dat gerust en duidelijk, ook al betekent dat dat er geen gesprek gestart wordt. Verkoop niets, wees gewoon eerlijk.

Antwoord alleen met geldige JSON, geen andere tekst, in dit exacte formaat:
{
  "key_points": ["...", "..."],
  "situation_summary": "...",
  "deeper_layer": "...",
  "reflection_questions": ["...", "...", "..."],
  "recommendation": "zelf",
  "recommendation_text": "..."
}`;

    const userPrompt = `${reflection.raw_content}\n\nGeef je reflectie in het gevraagde JSON-formaat, in het Nederlands.`;

    const aiResponse = await callClaude(systemPrompt, userPrompt, 2500);
    const cleaned = aiResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
await supabase.from('reflections').update({
      key_points: parsed.key_points || [],
      situation_summary: parsed.situation_summary,
      deeper_layer: parsed.deeper_layer,
      reflection_questions: parsed.reflection_questions,
      recommendation: parsed.recommendation,
      recommendation_text: parsed.recommendation_text,
      status: 'klaar',
    }).eq('id', reflectionId);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    await sendReflectionReadyEmail(reflection.email, reflection.name, `${siteUrl}/reflectie.html?token=${reflection.access_token}`);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    try {
      const supabase = getSupabase();
      await supabase.from('reflections').update({ status: 'mislukt' }).eq('id', reflectionId);
      sendAdminReflectionFailureAlert(reflectionId, err.message);
    } catch (e) {}
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
