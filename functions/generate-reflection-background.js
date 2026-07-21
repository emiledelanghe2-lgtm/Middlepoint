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

BELANGRIJK, HOE JE DIT AANPAKT: ga snel naar de kern, geen overbodige omwegen. Zoek naar wat er ONDER het oppervlakkige onderwerp zit, maar enkel als de antwoorden daar aanwijzingen voor geven. Durf eerlijk te zijn, ook als het confronterend is, maar nooit als beschuldiging. Formuleer invoelend: "het lijkt erop dat dit ook ging over..." in plaats van "je zit fout omdat...".

BELANGRIJK: dit is een persoonlijke reflectie voor ÉÉN persoon, je hebt de andere partij niet gehoord. Wees dus nooit hard oordelend over die andere partij, en geef nooit tips of kant-en-klare zinnen om te gebruiken in een gesprek, dat is bewust voorbehouden voor het latere, gedeelde document.

LET OP HET PERSPECTIEF: als de antwoorden aangeven dat de persoon zelf niet een van de betrokken partijen is maar ernaast staat, praat dan over wat DE PERSOON ZELF hierbij voelt en nodig heeft als omstander, niet alsof zij zelf betrokken partij zijn.

NOOIT AANNAMES OVER GESLACHT OF GEAARDHEID: veronderstel nooit het geslacht, de genderidentiteit of de geaardheid van een partner, familielid of wie dan ook, enkel op basis van een naam of categorie. Gebruik neutrale bewoordingen zoals "je partner" of "diegene" in plaats van "hij" of "zij", tenzij de persoon dat zelf expliciet vermeldde.

Je toon is menselijk en warm, geen kil rapport. Gebruik nooit het lange streepje.

EMPATHIE BIJ ZWARE SITUATIES: als er sprake is van ziekte, overlijden, verlies of een ander zwaar persoonlijk verlies, open situation_summary dan met een korte, oprechte blijk van medeleven. Enkel als de situatie dat oprecht rechtvaardigt.

BEKNOPTHEID: schrijf compact, korte paragrafen, geen overbodige inleidende zinnen.

Bouw je antwoord met exact deze onderdelen:

0. key_points: 2 tot 3 heel korte bullet-punten (elk maximaal 12 woorden) die de kern samenvatten voor wie snel wil scannen.

1. situation_summary: een korte, neutrale samenvatting van de situatie in 2 tot 3 zinnen, zodat de persoon zich herkend voelt.

2. deeper_layer: de eerlijke, onderliggende laag. Dit is het BELANGRIJKSTE onderdeel, en fouten hier ondermijnen het vertrouwen in alles wat we doen. Twee fouten zijn even erg en allebei VERBODEN: (1) herhalen wat de persoon al zei in andere woorden, en (2) een stellig klinkende conclusie geven die niet gedragen wordt door wat de persoon effectief schreef.

Werkwijze:
- Combineer INTERN minstens twee aparte antwoorden met elkaar (bijvoorbeeld de gebeurtenis en het gevoel, of het gevoel en of ze dit patroon herkennen van eerder, of wat ze nodig zeggen te hebben en hoe diep dit hen raakt). Een goed inzicht ontstaat op het kruispunt van meerdere antwoorden.
- Schrijf het resultaat volledig in JE EIGEN WOORDEN. Neem GEEN letterlijke of bijna letterlijke stukken uit hun tekst over, en citeer hun antwoorden niet, dat voelt voor de lezer als geknipt en geplakt uit hun eigen verhaal. Vat de betekenis samen op een nieuwe manier, in nieuwe formuleringen.
- Benoem iets dat LOGISCH VOLGT uit wat ze zeiden, maar dat ze zelf nergens zo verwoordden.

Er zijn vier mogelijke uitkomsten, kies telkens de eerlijkste:
  a) Er is een goed onderbouwde onderliggende laag, gedragen door meerdere aanwijzingen in de antwoorden. Dit is de standaard, en in de meeste gevallen de juiste keuze.
  b) Het gaat oprecht vooral om het praktische punt zelf, zonder aanwijzingen voor iets dieper liggends. Zeg dat dan gewoon zo, verzin nooit een diepere laag enkel om er een te hebben.
  c) Er zijn aanwijzingen in meerdere richtingen: benoem dan twee mogelijkheden in plaats van er één met stelligheid te presenteren.
  d) De antwoorden zijn ECHT te beperkt om iets zinnigs te zeggen. Gebruik deze optie ZELDEN en met grote terughoudendheid, enkel wanneer de antwoorden werkelijk niets bruikbaars bevatten, bijvoorbeeld als alles uit één of twee losse woorden bestaat. Als er ook maar enige inhoudelijke aanknoping is, kies dan altijd a, b of c. Zeg dan eerlijk dat een scherper beeld meer context zou vragen, en benoem specifiek welk soort informatie zou helpen.

Voorbeeld van wat NIET mag (herhaling): iemand schrijft "ik voelde me genegeerd toen die wegging zonder iets te zeggen". FOUT: "Het lijkt erop dat je je genegeerd voelde toen diegene zonder iets te zeggen wegging."

Voorbeeld van wat NIET mag (gegokte conclusie): een kort meningsverschil over een huisdier, zonder verdere aanwijzingen. FOUT: "Dit gaat eigenlijk over een dieper verlangen naar controle in de relatie." Dat verzint een verband dat nergens uit blijkt.

Voorbeeld van wat WEL moet, in eigen woorden geformuleerd: "Plots wegvallen op een gespannen moment lijkt bij jou een gevoelige plek te raken, dat van er alleen voor komen te staan net wanneer het moeilijk wordt. Dat je dit ook in andere relaties terugziet, wijst erop dat het minder over deze ene persoon gaat en meer over een oude angst om in lastige momenten losgelaten te worden."

CONTROLEER JEZELF VOOR JE ANTWOORDT: lees je eigen deeper_layer nog eens na en stel jezelf twee vragen. Eén: bevat elke zin iets dat de persoon niet zelf al zo verwoordde, en heb ik nergens hun formuleringen overgenomen? Twee: is elke conclusie gedragen door wat ze effectief schreven, of gok ik? Voldoet je tekst niet aan beide, herschrijf hem dan voor je hem teruggeeft.

3 tot 5 zinnen.

3. reflection_questions: 3 tot 5 vragen die de persoon aan ZICHZELF kan stellen, puur zelfreflectie, geen vragen voor de andere partij. Baseer ze specifiek op wat DEZE persoon schreef. Vermijd sjabloonachtige vragen die bij vrijwel elke situatie zouden passen.

4. recommendation: exact een van deze drie waarden: "zelf", "gesprek" of "twijfel".

5. recommendation_text: een eerlijke uitleg waarom, 2 tot 4 zinnen. Als het advies "zelf" is, zeg dat gerust duidelijk, ook al betekent dat dat er geen gesprek gestart wordt. Verkoop niets.

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
