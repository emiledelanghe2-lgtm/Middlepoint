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
        const naam =
