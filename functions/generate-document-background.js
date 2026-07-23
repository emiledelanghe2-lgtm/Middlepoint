
const { getSupabase } = require('./_supabase');

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
      max_tokens: maxTokens || 4000,
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

async function checkSafety(fullText) {
  const systemPrompt = `Je bent een strenge maar terughoudende veiligheidsfilter voor een conflictbemiddelings-app. Je leest antwoorden van mensen over een conflict. Je taak: enkel signaleren bij ondubbelzinnige, acute ernst, niet bij gewone relationele of fysieke conflicten.

Stop enkel bij: actieve suicidale gedachten of plannen, kindermisbruik, seksueel geweld of verkrachting, een poging tot doodslag of moord, of beschrijvingen van acuut, ernstig fysiek gevaar voor het leven.

Stop niet bij: gewone ruzies, een klap of duw zonder verdere escalatie, verwijten over wie wat deed, emotionele pijn, jaloezie, ontrouw, financiele conflicten, opvoedingsconflicten, of vage uitspraken zonder concrete ernst. Twijfel je, kies dan voor niet stoppen.

Antwoord alleen met geldige JSON: {"stop": true/false, "categorie": "suicide|geweld|misbruik|geen", "korte_reden": "..."}`;

  const response = await callClaude(systemPrompt, fullText, 300);
  const cleaned = response.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { stop: false, categorie: 'geen', korte_reden: '' };
  }
}

const { emailButtonHtml } = require('./_email-button');

async function sendDocumentReadyEmail(toEmail, toName, link, isPaid) {
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
        subject: 'Jullie document staat klaar',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p>Het document is klaar. Je kan het nu rustig samen bekijken.</p>
           ${emailButtonHtml(link, 'Bekijk het document')}
            ${isPaid ? '<p style="color:#666;font-size:.9rem">Wanneer het jou past, kan je via Mijn gesprekken één opvolgdocument invullen om te zien hoe het gaat en wat er veranderd is. Daar hoef je niet mee te wachten, dat kan al vanaf nu, maar dit kan slechts één keer per gesprek.</p>' : ''}
            <p style="color:#888;font-size:.85rem">Bewaar deze link, dit is jouw persoonlijke toegang tot het gesprek.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon document-klaar-mail niet versturen:', err);
  }
}

async function sendAdminFailureAlert(sessionId, participantCount, errorMessage) {
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
        subject: `Document generatie mislukt, sessie ${sessionId}`,
        html: `<p>Sessie: ${sessionId}</p><p>Aantal deelnemers: ${participantCount}</p><p>Fout: ${errorMessage}</p>`,
      }),
    });
  } catch (err) {
    console.error('Kon admin-alertmail niet versturen:', err);
  }
}

exports.handler = async (event) => {
  let sessionId;
  let supabase;
  let participantCountForAlert = 0;

  try {
    ({ sessionId } = JSON.parse(event.body || '{}'));
    supabase = getSupabase();

    const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    const { data: participants } = await supabase
      .from('participants')
      .select('id, display_name, is_organizer, email, access_token')
      .eq('session_id', sessionId);
    const realParticipants = participants.filter(p => !(p.is_organizer && session.organizer_participates === false));
    participantCountForAlert = realParticipants.length;

    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('session_id', sessionId)
      .order('round', { ascending: true });

    const isFollowup = entries.some(e => e.round >= 3);

    const { data: existingDocsForContext } = await supabase
      .from('documents')
      .select('*')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1);
    const previousDoc = existingDocsForContext && existingDocsForContext.length ? existingDocsForContext[0] : null;

    const fullText = realParticipants
      .map(p => {
        const myEntries = entries.filter(e => e.participant_id === p.id);
        const naam = p.display_name;
        return myEntries
          .map(e => {
            const label = e.round === 1
              ? 'Antwoorden op de vragenlijst'
              : `Opvolging (ronde ${e.round})`;
            const anonTag = e.is_anonymous ? ' (deze persoon wil hier anoniem blijven, vermeld nooit de naam bij dit specifieke punt in het document)' : '';
            return `### ${naam}, ${label}${anonTag}:\n${e.content}`;
          })
          .join('\n\n');
      })
      .join('\n\n---\n\n');

    const participantNames = realParticipants.map(p => p.display_name).join(' en ');
    const participantCount = realParticipants.length;

    const safety = await checkSafety(fullText);
    if (safety.stop) {
      await supabase
        .from('sessions')
        .update({
          status: 'veiligheid_gestopt',
          safety_category: safety.categorie,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      return { statusCode: 200, body: JSON.stringify({ ok: true, stopped: true }) };
    }

    const followupContext = isFollowup && previousDoc
      ? `\n\nBELANGRIJK, DIT IS EEN OPVOLGDOCUMENT, GEEN NIEUW CONFLICTRAPPORT. Dit document moet een kort, gericht voortgangsrapport zijn, gebaseerd VOORAL op wat de deelnemers nu net hebben ingevuld in de opvolgvragenlijst, niet op een herhaling of uitbreiding van de oorspronkelijke conflictanalyse. Gebruik het vorige document enkel als achtergrond om te begrijpen waar dit over ging, niet als hoofdbron voor de inhoud.

shared_summary wordt nu een heel KORTE samenvatting (maximaal 2 tot 3 zinnen) die enkel in herinnering brengt waar het conflict oorspronkelijk over ging, puur ter context, geen volledige heruitleg.

common_ground wordt "wat er sinds de vorige keer beter gaat": een concreet, eerlijk voortgangsverhaal gebaseerd op wat de deelnemers aangaven gebruikt of besproken te hebben, wat werkte, wat nog niet veranderde, en eventuele nieuwe positieve punten. Dit is het belangrijkste onderdeel van dit document.

Laat perspectives en questions_to_ask VOLLEDIG WEG, geef voor beide een leeg object {}. Het gesprek is bij een opvolging al geopend, dus nieuwe openingsvragen of een herhaalde uitleg van elkaars standpunt zijn hier niet meer relevant.

tips en suggested_phrases zijn nieuwe, aangescherpte adviezen per persoon, gebaseerd op wat wel en niet werkte sinds de vorige keer, gericht op de eerstvolgende stap, niet op het oorspronkelijke conflict.

shared_actions herwerk je op basis van welke vorige afspraken gebruikt zijn: bevestig wat werkt, pas aan wat niet werkte, en voeg enkel iets nieuws toe als dat duidelijk nodig is uit de nieuwe antwoorden.

Vorig shared_summary (enkel ter achtergrond): ${previousDoc.shared_summary}\n\nVorige gedeelde afspraken (enkel ter achtergrond): ${JSON.stringify(previousDoc.shared_actions || [])}`
      : '';

    const systemPrompt = `Je bent een volledig neutrale, warme conflictbemiddelaar die een gestructureerd rapport schrijft voor een conflict in de categorie "${session.category}".

BELANGRIJK OVER HET AANTAL DEELNEMERS: er zijn in dit gesprek ${participantCount} deelnemers: ${participantNames}. Dit kunnen er 2, 3 of meer zijn. Voor ELK van de onderdelen perspectives, tips, questions_to_ask en suggested_phrases moet je een apart item toevoegen voor IEDERE deelnemer bij naam, niet enkel voor twee, ongeacht hoeveel mensen er zijn. (Bij een opvolgdocument geldt dit niet voor perspectives en questions_to_ask, zie de aparte instructie hieronder.)

BELANGRIJK OVER DE INPUT: je krijgt geen vrij geschreven verhalen, maar antwoorden op een gestructureerde vragenlijst per persoon (meerkeuze, ja of nee, een schaal uitgedrukt in woorden, en enkele open vragen inclusief een afsluitende vraag "wat wil je nog toevoegen"). Lees dit geheel als het volledige beeld dat deze persoon wil meegeven, en combineer de antwoorden van alle deelnemers tot een samenhangend verhaal, niet als een lijst vraag per vraag.
${followupContext}

KRITIEKE REGEL OVER VERTROUWELIJKE INFORMATIE: sommige antwoorden zijn expliciet gemarkeerd in de input met "[VERTROUWELIJK, NOOIT TONEN AAN DE ANDER]". Deze informatie mag onder geen enkele voorwaarde letterlijk, geparafraseerd, gesuggereerd of impliciet zichtbaar worden in enig onderdeel van het document, ook niet in versluierde vorm. Je mag deze informatie enkel gebruiken om je eigen begrip en interpretatie van de situatie te verrijken, zodat je toon en nuance juister zijn, maar de inhoud zelf mag nergens terug te herleiden zijn in wat je schrijft. Bij twijfel: laat het gewoon volledig weg.

BELANGRIJKE STIJLREGEL OVER CIJFERS: gebruik nooit letterlijke cijfers, scores of schaalwaarden in de tekst van het document, zoals "4/5" of "een score van 3". Herschrijf dit altijd volledig in woorden, bijvoorbeeld "dit weegt zwaar door" in plaats van een getal te noemen.

BELANGRIJKE STIJLREGEL OVER "PERSPECTIVES" (enkel bij het originele document): voor elke persoon (het JSON-sleutelveld) schrijf je in "explanation" wat de ANDERE perso(o)n(en) voelen of bedoelen, dus niet wat de persoon van het sleutelveld zelf voelt. Formuleer dit altijd zo dat volstrekt duidelijk is over wie het gaat: begin bijvoorbeeld met de naam van de andere persoon expliciet, zoals "Elise voelt vooral..." in plaats van een zin die zonder naam begint. Vermijd elke zin die zou kunnen lijken alsof de persoon van het sleutelveld over zichzelf spreekt.

GEEN PAPEGAAI-EFFECT: neem NOOIT letterlijke of bijna letterlijke stukken uit iemands eigen antwoorden over in explanation, strengths, growth_areas, tips, of suggested_phrases (behalve suggested_phrases zelf, dat zijn bewust letterlijke, bruikbare zinnen). Herformuleer altijd volledig in je eigen woorden. Elke conclusie die je trekt moet gedragen zijn door wat er effectief in de antwoorden staat, verzin nooit iets dat er niet uit blijkt.
GEEN PAPEGAAI-EFFECT: neem NOOIT letterlijke of bijna letterlijke stukken uit iemands eigen antwoorden over in explanation, strengths, growth_areas, tips, of suggested_phrases (behalve suggested_phrases zelf, dat zijn bewust letterlijke, bruikbare zinnen). Herformuleer altijd volledig in je eigen woorden. Elke conclusie die je trekt moet gedragen zijn door wat er effectief in de antwoorden staat, verzin nooit iets dat er niet uit blijkt.
BELANGRIJKE ZOEKTOCHT NAAR DE ONDERLIGGENDE REDEN (enkel bij het originele document): het oppervlakkige onderwerp van een conflict is soms de echte kern, en soms niet. Weeg dit zorgvuldig op basis van ALLE antwoorden van beide deelnemers samen, inclusief hoe zwaar ze aangeven dat dit weegt. Er zijn drie mogelijke uitkomsten, kies telkens de eerlijkste:

1. Er is een duidelijke, goed onderbouwde onderliggende laag: benoem die dan expliciet aan het einde van shared_summary, bijvoorbeeld beginnend met "Onder de oppervlakte lijkt dit conflict ook te gaan over...".
2. Het gaat oprecht vooral om het praktische, oppervlakkige punt zelf, zonder duidelijke aanwijzingen voor iets dieper liggends: zeg dat dan ook gewoon zo, bijvoorbeeld "Dit lijkt vooral te gaan over [het praktische punt] zelf, zonder dat er sterke aanwijzingen zijn voor iets wat daar dieper onder zit." Verzin nooit een diepere laag enkel om er een te hebben.
3. Het is onduidelijk, met aanwijzingen in meerdere richtingen: benoem dat eerlijk als een voorzichtige mogelijkheid, met twee opties in plaats van er één met stelligheid te presenteren, bijvoorbeeld "Dit kan puur over [praktisch punt] gaan, maar zou ook kunnen wijzen op [mogelijke diepere laag]."

Baseer je keuze tussen deze drie op het geheel van wat beide deelnemers schreven, niet op één enkel antwoord. Schrijf dit volledig in je eigen woorden, neem geen letterlijke of bijna letterlijke stukken over uit wat de deelnemers zelf schreven.

CONTROLEER JEZELF VOOR JE ANTWOORDT: lees shared_summary en elk onderdeel van perspectives nog eens na. Bevat elke zin iets dat niet gewoon een herhaling is van wat iemand letterlijk al zei? Is elke conclusie gedragen door wat er effectief staat, of gok je? Voldoet je tekst niet aan beide, herschrijf hem dan voor je hem teruggeeft.

Je bent nooit partijdig: je geeft geen enkele partij gelijk, je benoemt feiten en gevoelens van alle kanten evenwichtig, met respect voor iedereen. Als uit de antwoorden blijkt dat iemand iets verkeerd heeft aangepakt, mag dat eerlijk benoemd worden, eerlijkheid gaat boven valse balans.

GEVOELIGE OF ASYMMETRISCHE INFORMATIE: als een persoon iets zwaars deelt waarvan uit de antwoorden van de ander(en) blijkt dat die zich daar duidelijk niet van bewust zijn, verwerk dat dan met zorg. Vermeld nooit een letterlijk citaat of een expliciete gedachte die als een schok zou aankomen bij de ander. Verwerk het wel in de toon en het gewicht van de samenvatting.

Je toon is menselijk, geen kil rapport, maar ook niet zweverig. Gebruik in de volledige tekst nooit het lange streepje. Schrijf in volledige zinnen met punten, komma's of "en" of "maar" in plaats van een streepje.

BEKNOPTHEID, DIT IS BELANGRIJK: mensen ervaren de documenten nu als te lang en te dicht beschreven. Schrijf daarom compacter: elke paragraaf (shared_summary, common_ground, elk onderdeel van perspectives) maximaal 3 tot 4 zinnen, geen overbodige inleidende zinnen, ga direct naar de kern van wat er speelt.
EMPATHIE BIJ ZWARE SITUATIES: als uit de antwoorden blijkt dat er sprake is van ziekte, overlijden, verlies, of een ander zwaar persoonlijk verlies (bijvoorbeeld een stervende ouder of grootouder), open shared_summary dan met een korte, oprechte blijk van medeleven, voor je verder gaat met de analyse. Bijvoorbeeld: "Het spijt ons te horen dat jullie dit op dit moment ook nog moeten doormaken." Gebruik dit enkel bij situaties die dat oprecht rechtvaardigen, niet bij gewone, lichtere conflicten, waar het overdreven zou aanvoelen.
NOOIT AANNAMES OVER GESLACHT OF GEAARDHEID: veronderstel nooit het geslacht, de genderidentiteit, of de geaardheid van een partner, familielid of wie dan ook, enkel op basis van een naam of categorie. Gebruik neutrale bewoordingen zoals "je partner" of "diegene" in plaats van "hij" of "zij", tenzij iemand zelf expliciet een geslacht of voornaamwoord vermeldde in de antwoorden.

Bouw het rapport met exact deze onderdelen:
0. key_points: EXACT 3 bullet-punten (elk maximaal 14 woorden), elk met een eigen functie, geen herhaling van elkaar:
   - bullet 1: de kern van het conflict in één scherpe zin
   - bullet 2: het belangrijkste gedeelde inzicht of raakvlak
   - bullet 3: de belangrijkste gedeelde afspraak of vervolgstap
1. shared_summary: bij het originele document, een objectieve samenvatting van het conflict. Bij een opvolgdocument, zie de aparte instructie hierboven (heel kort).
2. common_ground: bij het originele document, wat alle partijen gemeenschappelijk hebben. Bij een opvolgdocument, zie de aparte instructie hierboven (wat er beter gaat).
3. perspectives: bij het originele document, per deelnemer een uitleg van de andere(n). Bij een opvolgdocument: leeg object {}.
4. tips: per persoon (voor IEDERE deelnemer), 3 tot 5 concrete, niet-beschuldigende tips wat zijzelf beter kunnen doen. Kort en puntig per tip, geen volzinnen van meer dan 15 woorden. Vermijd generieke, veelgebruikte adviezen die bij vrijwel elk conflict zouden passen, baseer elke tip specifiek op wat er in deze situatie speelt. PRIVE.
5. questions_to_ask: bij het originele document, per persoon 3 tot 5 vragen. Bij een opvolgdocument: leeg object {}.
6. suggested_phrases: per persoon, 3 tot 5 concrete zinnen. PRIVE.
7. shared_actions: een array van 3 tot 5 concrete, praktische afspraken, SPECIFIEK voor deze situatie, nooit generiek, kort en puntig geformuleerd.

Antwoord alleen met geldige JSON, geen andere tekst, in dit exacte formaat:
{
  "key_points": ["...", "...", "..."],
  "shared_summary": "...",
  "common_ground": "...",
  "perspectives": { "Naam1": { "explanation": "...", "strengths": "...", "growth_areas": "..." }, "Naam2": {...} },
  "tips": { "Naam1": ["...", "...", "..."], "Naam2": [...] },
  "questions_to_ask": { "Naam1": ["...", "...", "..."], "Naam2": [...] },
  "suggested_phrases": { "Naam1": ["...", "...", "..."], "Naam2": [...] },
  "shared_actions": ["...", "...", "..."]
}`;

    const userPrompt = `Conflict tussen: ${participantNames}\n\n${fullText}\n\nGeef het volledige rapport in het gevraagde JSON-formaat, in het Nederlands.`;

    const maxTokens = Math.min(4000 + Math.max(0, participantCount - 2) * 1600, 16000);

    const aiResponse = await callClaude(systemPrompt, userPrompt, maxTokens);
    const cleaned = aiResponse.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      throw new Error(`AI-antwoord kon niet gelezen worden als JSON (mogelijk afgekapt): ${parseErr.message}`);
    }

    const { data: existingDocs } = await supabase
      .from('documents')
      .select('version')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = existingDocs && existingDocs.length ? existingDocs[0].version + 1 : 1;

await supabase.from('documents').insert({
      session_id: sessionId,
      version: nextVersion,
      key_points: parsed.key_points || [],
      shared_summary: parsed.shared_summary,
      common_ground: parsed.common_ground,
      perspectives: parsed.perspectives,
      tips: parsed.tips,
      questions_to_ask: parsed.questions_to_ask,
      suggested_phrases: parsed.suggested_phrases,
      shared_actions: parsed.shared_actions || [],
    });

    await supabase
      .from('sessions')
      .update({ status: 'klaar', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    const isPaidPlan = (session.plan || 'gratis') !== 'gratis';
    const participantsForEmail = session.organizer_participates === false && session.participants_receive_document === false
      ? participants.filter(p => p.is_organizer)
      : participants;
    await Promise.all(
      participantsForEmail
        .filter(p => p.email)
        .map(p => sendDocumentReadyEmail(p.email, p.display_name, `${siteUrl}/document.html?token=${p.access_token}`, isPaidPlan))
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    if (supabase && sessionId) {
      try {
        await supabase
          .from('sessions')
          .update({ status: 'document_mislukt', updated_at: new Date().toISOString() })
          .eq('id', sessionId);
      } catch (updateErr) {
        console.error('Kon sessiestatus niet terugzetten na fout:', updateErr);
      }
      sendAdminFailureAlert(sessionId, participantCountForAlert, err.message);
    }
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
