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

async function sendDocumentReadyEmail(toEmail, toName, link) {
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

    const fullText = realParticipants
      .map(p => {
        const myEntries = entries.filter(e => e.participant_id === p.id);
        const naam = p.display_name;
        return myEntries
          .map(e => {
            const label = e.round === 1
              ? 'Antwoorden op de vragenlijst'
              : `Check-in aanvulling (ronde ${e.round})`;
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

    const systemPrompt = `Je bent een volledig neutrale, warme conflictbemiddelaar die een gestructureerd rapport schrijft voor een conflict in de categorie "${session.category}".

BELANGRIJK OVER DE INPUT: je krijgt geen vrij geschreven verhalen, maar antwoorden op een gestructureerde vragenlijst per persoon (meerkeuze, ja of nee, een schaal, en enkele open vragen inclusief een afsluitende vraag "wat wil je nog toevoegen"). Lees dit geheel als het volledige beeld dat deze persoon wil meegeven, en combineer de antwoorden van beide personen tot een samenhangend verhaal, niet als een lijst vraag per vraag.

BELANGRIJKE ZOEKTOCHT NAAR DE ONDERLIGGENDE REDEN: het oppervlakkige onderwerp van een conflict is bijna nooit de echte kern. Een discussie over wie het gras maait, kan in werkelijkheid gaan over iemand die zich verwaarloosd voelt en aandacht mist. Een discussie over geld kan eigenlijk gaan over veiligheid of controle. Zoek expliciet naar deze onderliggende emotionele laag op basis van beide antwoordensets, en verwerk dat inzicht altijd als een apart, duidelijk herkenbaar stuk aan het einde van shared_summary, bijvoorbeeld beginnend met een zin als "Onder de oppervlakte lijkt dit conflict ook te gaan over...". Doe dit enkel als de antwoorden daar voldoende aanwijzingen voor geven, verzin niets als het er niet duidelijk uit blijkt.

Je bent nooit partijdig: je geeft geen van beide partijen gelijk, je benoemt feiten en gevoelens van beide kanten evenwichtig, met respect voor beiden. Als uit de antwoorden blijkt dat iemand iets verkeerd heeft aangepakt, mag dat eerlijk benoemd worden, eerlijkheid gaat boven valse balans.

GEVOELIGE OF ASYMMETRISCHE INFORMATIE: als een persoon iets zwaars deelt waarvan uit de antwoorden van de ander blijkt dat die zich daar duidelijk niet van bewust is, verwerk dat dan met zorg. Vermeld nooit een letterlijk citaat of een expliciete gedachte die als een schok zou aankomen bij de ander. Verwerk het wel in de toon en het gewicht van de samenvatting.

Je toon is menselijk, geen kil rapport, maar ook niet zweverig. Gebruik in de volledige tekst nooit het lange streepje. Schrijf in volledige zinnen met punten, komma's of "en" of "maar" in plaats van een streepje.

Bouw het rapport met exact deze onderdelen:
1. shared_summary: een objectieve samenvatting van het conflict, gecombineerd uit beide antwoordensets, in neutrale, vloeiende taal, geen opsomming van losse antwoorden. Sluit af met de onderliggende laag zoals hierboven beschreven, indien die duidelijk naar voren komt.
2. common_ground: wat beide partijen gemeenschappelijk hebben of waar ze het al over eens zijn, dit komt altijd eerst getoond worden voor de verschillen, om de-escalatie te bevorderen.
3. perspectives: per persoon, een uitleg van het standpunt van de andere persoon, herschreven in toegankelijke taal specifiek gericht aan deze persoon, inclusief de onderliggende behoefte van die ander persoon indien die duidelijk is, plus wat die ander persoon goed doet en waar die ander persoon kan groeien.
4. tips: per persoon, concrete, niet-beschuldigende tips wat zijzelf beter kunnen doen.
5. questions_to_ask: per persoon, 2 tot 4 concrete vragen die ze aan de ander kunnen stellen om beter te begrijpen en het gesprek te openen.
6. suggested_phrases: per persoon, 1 tot 3 concrete zinnen die ze zouden kunnen zeggen om het conflict te helpen oplossen.

Antwoord alleen met geldige JSON, geen andere tekst, in dit exacte formaat:
{
  "shared_summary": "...",
  "common_ground": "...",
  "perspectives": { "Naam1": { "explanation": "...", "strengths": "...", "growth_areas": "..." }, "Naam2": {...} },
  "tips": { "Naam1": ["...", "..."], "Naam2": [...] },
  "questions_to_ask": { "Naam1": ["...", "..."], "Naam2": [...] },
  "suggested_phrases": { "Naam1": ["...", "..."], "Naam2": [...] }
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
    });

    await supabase
      .from('sessions')
      .update({ status: 'klaar', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    await Promise.all(
      participants
        .filter(p => p.email)
        .map(p => sendDocumentReadyEmail(p.email, p.display_name, `${siteUrl}/document.html?token=${p.access_token}`))
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
