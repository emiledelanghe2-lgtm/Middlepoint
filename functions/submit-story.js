const { getSupabase } = require('./_supabase');

async function sendStorySubmittedEmail(toEmail, toName, fromName, siteUrl, accessLink) {
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
        subject: `${fromName} heeft zijn verhaal ingediend`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p><strong>${fromName}</strong> heeft zojuist zijn kant van het verhaal ingediend bij Middlepoint.</p>
            <p>Zodra iedereen zijn verhaal heeft ingediend, gaan we verder met de volgende stap.</p>
            <p style="margin:28px 0">
              <a href="${siteUrl}${accessLink}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Bekijk mijn status</a>
            </p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon story-ingediend-mail niet versturen:', err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, content, isAnonymous } = JSON.parse(event.body || '{}');
    if (!token || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token en content zijn verplicht.' }) };
    }
    const supabase = getSupabase();
    const { data: participant, error: pError } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (pError || !participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }
    const isPureThirdParty = participant.is_organizer && !!participant.sessions.organizer_role;
    if (isPureThirdParty) {
      return { statusCode: 400, body: JSON.stringify({ error: 'De organisator vult zelf geen verhaal in.' }) };
    }
    await supabase.from('entries').insert({
      session_id: participant.session_id,
      participant_id: participant.id,
      round: 1,
      content,
      is_anonymous: !!isAnonymous,
    });

    const { data: allParticipants } = await supabase
      .from('participants')
      .select('id, is_organizer, display_name, email, access_token')
      .eq('session_id', participant.session_id);

    const sessionOrganizerRole = participant.sessions.organizer_role;
    const requiredIds = allParticipants
      .filter(p => !(p.is_organizer && sessionOrganizerRole))
      .map(p => p.id);

    const { data: round1Entries } = await supabase
      .from('entries')
      .select('participant_id')
      .eq('session_id', participant.session_id)
      .eq('round', 1);
    const submittedIds = new Set((round1Entries || []).map(e => e.participant_id));
    const everyoneSubmitted = requiredIds.every(id => submittedIds.has(id));

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';

    if (!everyoneSubmitted) {
      const others = allParticipants.filter(p => p.id !== participant.id && p.email);
      await Promise.all(
        others.map(p =>
          sendStorySubmittedEmail(p.email, p.display_name, participant.display_name, siteUrl, `/story.html?token=${p.access_token}`)
        )
      );
    }

    // AANGEPAST: geen vervolgvragen-stap meer. De vragenlijst die de gebruiker nu
    // invult op story.html is al gestructureerd en diepgaand genoeg, dus zodra
    // iedereen zijn antwoorden heeft ingediend, gaat het rechtstreeks naar
    // documentgeneratie. generate-followups-background.js wordt hierdoor niet
    // meer aangeroepen voor nieuwe sessies.
    if (everyoneSubmitted) {
      await supabase
        .from('sessions')
        .update({ status: 'document_genereren', updated_at: new Date().toISOString() })
        .eq('id', participant.session_id);

      try {
        await fetch(`${siteUrl}/.netlify/functions/generate-document-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: participant.session_id }),
        });
      } catch (e) {
        console.error('Kon document-background niet triggeren:', e);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, everyoneSubmitted }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
