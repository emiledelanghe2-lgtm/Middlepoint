const { getSupabase } = require('./_supabase');
const { normLang, reqLang, pre, tr } = require('./_lang');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { email, lang } = JSON.parse(event.body || '{}');
    const L = reqLang(event, lang);
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'E-mailadres is verplicht.', 'Email address is required.') }) };
    }

    const supabase = getSupabase();
    const { data: participants } = await supabase
      .from('participants')
      .select('display_name, access_token, session_id, sessions(*)')
      .eq('email', email);

    // Altijd hetzelfde antwoord, ongeacht of er iets gevonden werd (geen info lekken over wie wel/niet gebruiker is)
    if (!participants || participants.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: tr(L, 'E-mailverzending is nog niet ingesteld.', 'Email sending is not set up yet.') }) };
    }

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    const linksHtml = participants
      .map(p => `<li style="margin-bottom:10px"><a href="${siteUrl}${pre(normLang(p.sessions && p.sessions.lang))}/story.html?token=${p.access_token}">${tr(normLang(p.sessions && p.sessions.lang), 'Gesprek als', 'Conversation as')} ${p.display_name}</a></li>`)
      .join('');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Middlepoint <onboarding@resend.dev>',
        to: email,
        subject: tr(L, 'Jouw Middlepoint-links', 'Your Middlepoint links'),
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">${tr(L, 'Hey,', 'Hi,')}</h2>
            <p>${tr(L, 'Hier zijn de gesprekken die bij dit e-mailadres horen:', 'Here are the conversations that belong to this email address:')}</p>
            <ul>${linksHtml}</ul>
            <p style="color:#888;font-size:.85rem">${tr(L, 'Heb je dit niet aangevraagd? Dan kan je deze mail gewoon negeren.', 'Did you not request this? Then you can simply ignore this email.')}</p>
          </div>`,
      }),
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
