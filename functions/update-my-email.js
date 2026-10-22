const { getSupabase } = require('./_supabase');
const { reqLang, pre, tr, greeting } = require('./_lang');
const crypto = require('crypto');

async function sendEmailChangedConfirmation(toEmail, siteUrl, magicToken, L) {
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
        subject: tr(L, 'Je e-mailadres bij Middlepoint is gewijzigd', 'Your email address at Middlepoint has been changed'),
        html: L === 'en' ? `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hi,</h2>
            <p>Your email address at Middlepoint has just been changed to this address. All your conversations, your plan and your access have been transferred automatically.</p>
            <p style="margin:28px 0">
              <a href="${siteUrl}/en/mijn-gesprekken.html?token=${magicToken}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Go to My conversations</a>
            </p>
            <p style="color:#888;font-size:.85rem">Did you not do this yourself? Then contact us at middlepoint@zohomail.eu.</p>
          </div>` : `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey,</h2>
            <p>Je e-mailadres bij Middlepoint is zonet gewijzigd naar dit adres. Al je gesprekken, je plan en je toegang zijn hier automatisch mee overgezet.</p>
            <p style="margin:28px 0">
              <a href="${siteUrl}/mijn-gesprekken.html?token=${magicToken}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Naar Mijn gesprekken</a>
            </p>
            <p style="color:#888;font-size:.85rem">Heb jij dit niet zelf gedaan? Neem dan contact op via middlepoint@zohomail.eu.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon email-gewijzigd-mail niet versturen:', err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, newEmail, lang } = JSON.parse(event.body || '{}');
    const L = reqLang(event, lang);
    if (!token || !newEmail || !newEmail.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'token en newEmail zijn verplicht.', 'token and newEmail are required.') }) };
    }
    const normalizedEmail = newEmail.toLowerCase().trim();
    if (!normalizedEmail.includes('@')) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'Vul een geldig e-mailadres in.', 'Please enter a valid email address.') }) };
    }

    const supabase = getSupabase();
    const { data: customer, error: cError } = await supabase
      .from('customers')
      .select('*')
      .eq('magic_link_token', token)
      .maybeSingle();
    if (cError || !customer) {
      return { statusCode: 404, body: JSON.stringify({ error: tr(L, 'Ongeldige of verlopen link. Log opnieuw in via Mijn gesprekken.', 'Invalid or expired link. Log in again via My conversations.') }) };
    }
    if (new Date(customer.magic_link_expires) < new Date()) {
      return { statusCode: 401, body: JSON.stringify({ error: tr(L, 'Je link is verlopen. Vraag een nieuwe login-link aan en probeer opnieuw.', 'Your link has expired. Request a new login link and try again.') }) };
    }

    const oldEmail = customer.email;
    if (normalizedEmail === oldEmail) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'Dit is al je huidige e-mailadres.', 'This is already your current email address.') }) };
    }

    const { data: conflict } = await supabase
      .from('customers')
      .select('email')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (conflict) {
      return { statusCode: 409, body: JSON.stringify({ error: tr(L, 'Dit e-mailadres is al in gebruik bij een ander account. Neem contact op als je denkt dat dit een vergissing is.', 'This email address is already in use by another account. Contact us if you think this is a mistake.') }) };
    }

    // Nieuwe magic link genereren: de oude blijft anders nog tot 24u bruikbaar
    // om het e-mailadres opnieuw te wijzigen als de mail ooit doorgestuurd raakt.
    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('customers').update({
      email: normalizedEmail,
      magic_link_token: newToken,
      magic_link_expires: newExpires,
      updated_at: new Date().toISOString(),
    }).eq('magic_link_token', token);
    await supabase.from('sessions').update({ organizer_email: normalizedEmail, updated_at: new Date().toISOString() }).eq('organizer_email', oldEmail);
    await supabase.from('participants').update({ email: normalizedEmail }).eq('email', oldEmail);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    await sendEmailChangedConfirmation(normalizedEmail, siteUrl, newToken, L);

    return { statusCode: 200, body: JSON.stringify({ ok: true, newEmail: normalizedEmail }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
