const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'E-mailadres is verplicht.' }) };
    }

    const supabase = getSupabase();
    const { data: participants } = await supabase
      .from('participants')
      .select('display_name, access_token, session_id')
      .eq('email', email);

    // Altijd hetzelfde antwoord, ongeacht of er iets gevonden werd (geen info lekken over wie wel/niet gebruiker is)
    if (!participants || participants.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: 'E-mailverzending is nog niet ingesteld.' }) };
    }

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    const linksHtml = participants
      .map(p => `<li style="margin-bottom:10px"><a href="${siteUrl}/story.html?token=${p.access_token}">Gesprek als ${p.display_name}</a></li>`)
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
        subject: 'Jouw Middlepoint-links',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey,</h2>
            <p>Hier zijn de gesprekken die bij dit e-mailadres horen:</p>
            <ul>${linksHtml}</ul>
            <p style="color:#888;font-size:.85rem">Heb je dit niet aangevraagd? Dan kan je deze mail gewoon negeren.</p>
          </div>`,
      }),
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
