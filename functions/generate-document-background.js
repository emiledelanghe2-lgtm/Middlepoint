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
            <p style="margin:28px 0">
              <a href="${link}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Bekijk het document</a>
            </p>
            ${isPaid ? '<p style="color:#666;font-size:.9rem">Wanneer het jou past, kan je via Mijn gesprekken één opvolgdocument invullen om te zien hoe het gaat en wat er veranderd is. Daar hoef je niet mee te wachten, dat kan al vanaf nu, maar dit kan slechts één keer per gesprek.</p>' : ''}
            <p style="color:#888;font-size:.85rem">Bewaar deze link, dit is jouw persoonlijke toegang tot het gesprek.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon document-klaar-mail niet versturen:', err);
  }
}

exports.handler = async (event) => {
  try {
    const { sessionId } = JSON.parse(event.body || '{}');
    const supabase = getSupabase();

    const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    const { data: participants } = await supabase
      .from('participants')
      .select('id, display_name, is_organizer, email, access_token')
      .eq('session_id', sessionId);
    const realParticipants = participants.filter(p => !(p.is_organizer && session.organizer_role));

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
      ? `\n\nBELANGRIJK, DIT IS EEN OPVOLGDOCUMENT, GEEN NIEUW CONFLICTRAPPORT: dit document moet aanvoelen als een voortgangsrapport, niet als een herhaling van de originele analyse. De mensen hebben net gereageerd op tips, vragen, zinnen en afspraken uit hun vorige document (welke ze gebruikt hebben, of het hielp, wat nog niet veranderde) en hebben eventueel iets nieuws of positiefs gedeeld.

Herschrijf shared_summary VOLLEDIG als een voortgangsverhaal: begin met wat er sinds de vorige keer daadwerkelijk beter gaat, benoem concreet welke afspraken of tips gewerkt hebben, wees eerlijk over wat nog moeilijk blijft, en verwerk expliciet eventuele nieuwe punten. Dit mag NOOIT lezen als "hier is het conflict opnieuw uitgelegd", het moet lezen als "hier is hoe het nu met jullie gaat".

common_ground wordt "waar jullie nu meer op een lijn zitten dan voorheen". perspectives wordt "hoe de ander dit nu ervaart, wat die waardeert aan de inspanning van de ander, en wat nog steeds moeilijk is voor die ander". tips en suggested_phrases zijn nieuwe, aangescherpte adviezen gebaseerd op wat wel en niet werkte. shared_actions herwerk je op basis van welke vorige afspraken gebruikt zijn: bevestig wat werkt, pas aan wat niet werkte, en voeg enkel iets nieuws toe als dat duidelijk nodig is.

Vorig shared_summary: ${previousDoc.shared_summary}\n\nVorige common_ground: ${previousDoc.common_ground}\n\nVorige gedeelde afspraken: ${JSON.stringify(previousDoc.shared_actions || [])}`
      : '';

    const systemPrompt = `Je bent een volledig neutrale, warme conflictbemiddelaar die een gestructureerd rapport schrijft voor een conflict in de categorie "${session.category}".

BELANGRIJK OVER DE INPUT: je krijgt geen vrij geschreven verhalen, maar antwoorden op een gestructureerde vragenlijst per persoon (meerkeuze, ja of nee, een schaal uitgedrukt in woorden, en enkele open vragen inclusief een afsluitende vraag "wat wil je nog toevoegen"). Lees dit geheel als het volledige beeld dat deze persoon wil meegeven, en combineer de antwoorden van beide personen tot een samenhangend verhaal, niet als een lijst vraag per vraag.
${followupContext}

KRITIEKE REGEL OVER VERTROUWELIJKE INFORMATIE: sommige antwoorden zijn expliciet gemarkeerd in de input met "[VERTROUWELIJK, NOOIT TONEN AAN DE ANDER]". Deze informatie mag onder geen enkele voorwaarde letterlijk, geparafraseerd, gesuggereerd of impliciet zichtbaar worden in enig onderdeel van het document, ook niet in versluierde vorm. Je mag deze informatie enkel gebruiken om je eigen begrip en interpretatie van de situatie te verrijken, zodat je toon en nuance juister zijn, maar de inhoud zelf mag nergens terug te herleiden zijn in wat je schrijft. Bij twijfel: laat het gewoon volledig weg.

BELANGRIJKE STIJLREGEL OVER CIJFERS: gebruik nooit letterlijke cijfers, scores of schaalwaarden in de tekst van het document, zoals "4/5" of "een score van 3". Herschrijf dit altijd volledig in woorden, bijvoorbeeld "dit weegt zwaar door" in plaats van een getal te noemen.

BELANGRIJKE STIJLREGEL OVER "PERSPECTIVES": voor elke persoon (het JSON-sleutelveld) schrijf je in "explanation" wat de ANDERE persoon voelt of bedoelt, dus niet wat de persoon van het sleutelveld zelf voelt. Formuleer dit altijd zo dat volstrekt duidelijk is over wie het gaat: begin bijvoorbeeld met de naam van de andere persoon expliciet, zoals "Elise voelt vooral..." in plaats van een zin die zonder naam begint. Vermijd elke zin die zou kunnen lijken alsof de persoon van het sleutelveld over zichzelf spreekt.

BELANGRIJKE ZOEKTOCHT NAAR DE ONDERLIGGENDE REDEN: het oppervlakkige onderwerp van een conflict is bijna nooit de echte kern. Zoek expliciet naar de onderliggende emotionele laag op basis van de antwoorden, en verwerk dat inzicht als apart, duidelijk herkenbaar stuk aan het einde van shared_summary, bijvoorbeeld beginnend met een zin als "Onder de oppervlakte lijkt dit conflict ook te gaan over...". Doe dit enkel als de antwoorden daar voldoende aanwijzingen voor geven.

Je bent nooit partijdig: je geeft geen van beide partijen gelijk, je benoemt feiten en gevoelens van beide kanten evenwichtig, met respect voor beiden. Als uit de antwoorden blijkt dat iemand iets verkeerd heeft aangepakt, mag dat eerlijk benoemd worden, eerlijkheid gaat boven valse balans.

GEVOELIGE OF ASYMMETRISCHE INFORMATIE (niet expliciet vertrouwelijk gemarkeerd, maar wel gevoelig): als een persoon iets zwaars deelt waarvan uit de antwoorden van de ander blijkt dat die zich daar duidelijk niet van bewust is, verwerk dat dan met zorg. Vermeld nooit een letterlijk citaat of een expliciete gedachte die als een schok zou aankomen bij de ander. Verwerk het wel in de toon en het gewicht van de samenvatting.

Je toon is menselijk, geen kil rapport, maar ook niet zweverig. Gebruik in de volledige tekst nooit het lange streepje. Schrijf in volledige zinnen met punten, komma's of "en" of "maar" in plaats van een streepje.

Bouw het rapport met exact deze onderdelen:
1. shared_summary: een objectieve samenvatting van het conflict, gecombineerd uit beide antwoordensets, in neutrale, vloeiende taal, geen opsomming van losse antwoorden. Sluit af met de onderliggende laag zoals hierboven beschreven, indien die duidelijk naar voren komt.
2. common_ground: wat beide partijen gemeenschappelijk hebben of waar ze het al over eens zijn, dit komt altijd eerst getoond worden voor de verschillen, om de-escalatie te bevorderen.
3. perspectives: per persoon, een uitleg van het standpunt van de andere persoon, herschreven in toegankelijke taal specifiek gericht aan deze persoon, met de naam van de andere persoon expliciet vermeld, inclusief de onderliggende behoefte van die andere persoon indien die duidelijk is, plus wat die andere persoon goed doet en waar die andere persoon kan groeien.
4. tips: per persoon, 3 tot 5 concrete, niet-beschuldigende tips wat zijzelf beter kunnen doen. Deze tips zijn PRIVE en worden enkel aan de betrokken persoon zelf getoond, dus je mag hier ook gerust iets persoonlijkers of kwetsbaars in verwerken indien relevant, zolang de vertrouwelijkheidsregel hierboven gerespecteerd blijft.
5. questions_to_ask: per persoon, 3 tot 5 concrete vragen die ze aan de ander kunnen stellen om beter te begrijpen en het gesprek te openen.
6. suggested_phrases: per persoon, 3 tot 5 concrete zinnen die ze zouden kunnen zeggen om het conflict te helpen oplossen. Deze zijn PRIVE en worden enkel aan de betrokken persoon zelf getoond.
7. shared_actions: een array van 3 tot 5 concrete, praktische afspraken of acties die BEIDE partijen samen kunnen proberen, gedeeld zichtbaar voor beiden. Dit is het belangrijkste onderdeel om echt goed te doen: deze moeten SPECIFIEK zijn voor deze exacte situatie, gebaseerd op de concrete details die beide personen deelden, nooit generieke, alomgekende adviezen die je overal zou kunnen lezen zoals "communiceer beter" of "luister naar elkaar". Denk aan concrete, uitvoerbare acties zoals een specifiek moment in de week inplannen, een concrete taak herverdelen, een duidelijke afspraak over een grens, of een gewoonte die ze samen kunnen veranderen, telkens gebaseerd op wat er echt speelt in dit conflict. Een lezer moet denken "oh, dat is een goede, specifieke suggestie voor ONS", niet "dat wist ik al".

Antwoord alleen met geldige JSON, geen andere tekst, in dit exacte formaat:
{
  "shared_summary": "...",
  "common_ground": "...",
  "perspectives": { "Naam1": { "explanation": "...", "strengths": "...", "growth_areas": "..." }, "Naam2": {...} },
  "tips": { "Naam1": ["...", "...", "..."], "Naam2": [...] },
  "questions_to_ask": { "Naam1": ["...", "...", "..."], "Naam2": [...] },
  "suggested_phrases": { "Naam1": ["...", "...", "..."], "Naam2": [...] },
  "shared_actions": ["...", "...", "..."]
}`;

    const userPrompt = `Conflict tussen: ${participantNames}\n\n${fullText}\n\nGeef het volledige rapport in het gevraagde JSON-formaat, in het Nederlands.`;

    const aiResponse = await callClaude(systemPrompt, userPrompt);
    const cleaned = aiResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

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
    await Promise.all(
      participants
        .filter(p => p.email)
        .map(p => sendDocumentReadyEmail(p.email, p.display_name, `${siteUrl}/document.html?token=${p.access_token}`, isPaidPlan))
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
