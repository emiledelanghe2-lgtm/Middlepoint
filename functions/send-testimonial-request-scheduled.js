const { getSupabase } = require('./_supabase');
const { emailButtonHtml } = require('./_email-button');

async function sendTestimonialRequestEmail(toEmail, toName, link) {
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
        subject: 'Hoe ging het?',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p>Een tijdje geleden gebruikte je Middlepoint. We zijn benieuwd: hoe ging het?</p>
            <p>Zou je kort willen delen hoe het jullie geholpen heeft? Het hoeft maar één zin te zijn.</p>
            ${emailButtonHtml(link, 'Deel kort je ervaring')}
            <p style="color:#888;font-size:.85rem">Dit is een eenmalige mail. Liever niet? Geen probleem, je hoeft niets te doen.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon testimonial-verzoek niet versturen:', err);
  }
}

exports.handler = async () => {
  try {
    const supabase = getSupabase();
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Gesprekken die 4 tot 7 dagen geleden klaar kwamen, met een niet-gratis
    // plan (mensen die effectief betaalden zijn de meest waarschijnlijke bron
    // van een goede getuigenis), waarvoor nog geen verzoek verstuurd is.
    const { data: candidates } = await supabase
      .from('sessions')
      .select('id, plan, testimonial_request_sent, documents(created_at)')
      .eq('status', 'klaar')
      .eq('testimonial_request_sent', false)
      .neq('plan', 'gratis');

    if (!candidates || !candidates.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, processed: 0 }) };
    }

    let processed = 0;
    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';

    for (const session of candidates) {
      const docs = session.documents || [];
      if (!docs.length) continue;
      const oldestDoc = docs.reduce((a, b) => (a.created_at < b.created_at ? a : b));
      if (oldestDoc.created_at > fourDaysAgo || oldestDoc.created_at < sevenDaysAgo) continue;

      const { data: participants } = await supabase
        .from('participants')
        .select('display_name, email')
        .eq('session_id', session.id);

      await Promise.all(
        (participants || [])
          .filter(p => p.email)
          .map(p => {
            const link = `${siteUrl}/testimonials.html?name=${encodeURIComponent(p.display_name || '')}#deelFormulier`;
            return sendTestimonialRequestEmail(p.email, p.display_name, link);
          })
      );

      await supabase
        .from('sessions')
        .update({ testimonial_request_sent: true })
        .eq('id', session.id);
      processed++;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, processed }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
