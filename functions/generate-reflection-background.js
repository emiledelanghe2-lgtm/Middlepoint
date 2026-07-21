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

2. deeper_layer: de eerlijke, onderliggende laag. Dit is het BELANGRIJKSTE onderdeel van het hele document, en fouten hier ondermijnen het vertrouwen in alles wat we doen. Twee fouten zijn even erg en allebei VERBODEN: (1) gewoon herhalen wat de persoon al zei in andere woorden, en (2) een stellig klinkende conclusie geven die niet goed onderbouwd is door wat de persoon effectief schreef.

Volg deze werkwijze verplicht:
- Weeg ALLE antwoorden samen, inclusief hoe diep de persoon aangeeft dat dit hen raakt en of ze dit patroon herkennen van eerder.
- Er zijn VIER mogelijke uitkomsten, kies telkens de eerlijkste, gebaseerd op hoeveel de antwoorden je écht vertellen:
  a) Er is een duidelijke, goed onderbouwde onderliggende laag, gedragen door minstens twee concrete aanwijzingen in de antwoorden: benoem die dan expliciet, en verwijs letterlijk naar welke twee antwoorden je conclusie dragen.
  b) Het gaat oprecht vooral om het praktische, oppervlakkige punt zelf, zonder duidelijke aanwijzingen voor iets dieper liggends: zeg dat dan ook gewoon zo, bijvoorbeeld "Dit lijkt vooral te gaan over [het praktische punt] zelf, zonder dat er sterke aanwijzingen zijn voor iets wat daar dieper onder zit."
  c) Er zijn aanwijzingen in meerdere richtingen: benoem dat eerlijk als een voorzichtige mogelijkheid, met TWEE opties, elk gedragen door een concreet element uit de antwoorden.
  d) DE ANTWOORDEN ZIJN TE BEPERKT OF TE ALGEMEEN om hier iets specifieks over te zeggen: zeg dat dan eerlijk, bijvoorbeeld "Op basis van wat je hier deelde, is dit lastig met zekerheid te zeggen. Wil je een scherper beeld, dan zou het helpen om iets concreter te maken [benoem specifiek welk soort extra informatie zou helpen]." Verkies dit boven een gegokte conclusie.
- Kies je voor optie a of c: verbind minstens TWEE aparte, concrete antwoorden met elkaar, en noem expliciet WELKE twee dat zijn (bijvoorbeeld: "omdat je aangaf dit ook te herkennen bij [specifiek antwoord], en dat het je vooral raakt op het moment dat [ander specifiek antwoord]..."). Een vage conclusie zonder concrete verwijzing naar wat de persoon zei, is niet toegestaan.

Voorbeeld van wat NIET mag (herhaling): iemand schrijft "ik voelde me genegeerd toen hij wegging zonder iets te zeggen". FOUT: "Het lijkt erop dat je je genegeerd voelde toen hij zonder iets te zeggen wegging."

Voorbeeld van wat NIET mag (gegokte conclusie zonder onderbouwing): een kort antwoord over een meningsverschil over een hond, zonder verdere aanwijzingen. FOUT: "Dit gaat eigenlijk over een dieper verlangen naar controle in de relatie." Dit verzint een link die nergens in de antwoorden staat.

Voorbeeld van wat WEL moet (goed onderbouwd, met expliciete verwijzing): "Dit weglopen zonder uitleg lijkt een specifieke wond te raken, het gevoel er alleen voor te staan op het moment dat het moeilijk wordt. Omdat je aangaf dit patroon ook te herkennen bij andere relaties, gaat dit waarschijnlijk minder over deze ene persoon, en meer over een diepere angst om in lastige momenten aan je lot overgelaten te worden."

VOOR JE ANTWOORDT, CONTROLEER JEZELF: lees je eigen deeper_layer-tekst nog eens na en stel jezelf twee vragen. Eén: bevat elke zin iets dat de persoon niet letterlijk of bijna letterlijk zelf al schreef? Twee: is elke conclusie die ik trek, expliciet gedragen door een concreet element uit hun antwoorden, of gok ik? Voldoet je antwoord niet aan beide, herschrijf het dan voor je het teruggeeft.

3 tot 5 zinnen, of korter als optie d van toepassing is.

3. reflection_questions: 3 tot 5 vragen die de persoon aan ZICHZELF kan stellen, geen vragen voor de andere partij, puur zelfreflectie. Baseer deze vragen specifiek op wat DEZE persoon schreef, niet op generieke reflectievragen die bij elke situatie zouden passen. Vermijd sjabloonachtige vragen die je bij vrijwel elk antwoord zou kunnen stellen.
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
