const { getSupabase } = require('./_supabase');
const crypto = require('crypto');

async function sendMagicLinkEmail(toEmail, magicLink) {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY niet ingesteld');
    return;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Middlepoint <onboarding@resend.dev>',
      to: toEmail,
      subject: 'Jouw toegangslink voor Middlepoint',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
          <h2 style="color:#3A4A5C">Jouw toegangslink</h2>
          <p>Klik op de knop hieronder om in te loggen en al jouw gesprekken en documenten te bekijken.</p>
          <p style="margin:28px 0">
            <a href="${magicLink}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Bekijk mijn gesprekken</a>
          </p>
          <p style="color:#888;font-size:.85rem">Deze link is 24 uur geldig en kan maar één keer gebruikt worden. Als je deze mail niet aangevraagd hebt, kan je hem gewoon negeren.</p>
        </div>`,
    }),
  });
}

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
    const normalizedEmail = email.toLowerCase().trim();

    // Check of dit e-mailadres ooit een sessie/document heeft
    const { data: participant } = await supabase
      .from('participants')
      .select('id')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (!participant) {
      // Geen sessies gevonden, maar stuur toch een neutrale bevestiging
      // (om niet te onthullen of een adres bij ons bekend is)
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Genereer een unieke, veilige token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24u geldig

    // Sla op in customers-tabel (maak record aan als het nog niet bestaat)
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('customers')
        .update({
          magic_link_token: token,
          magic_link_expires: expires,
          updated_at: new Date().toISOString(),
        })
        .eq('email', normalizedEmail);
    } else {
      await supabase.from('customers').insert({
        email: normalizedEmail,
        plan: 'gratis',
        magic_link_token: token,
        magic_link_expires: expires,
      });
    }

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'https://middlepoint.net';
    const magicLink = `${siteUrl}/mijn-gesprekken.html?token=${token}`;
    await sendMagicLinkEmail(normalizedEmail, magicLink);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
