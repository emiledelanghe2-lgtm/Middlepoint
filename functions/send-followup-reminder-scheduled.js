const { getSupabase } = require('./_supabase');

async function sendReminderEmail(toEmail, toName, link) {
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
        subject: 'Tijd voor een korte opvolging?',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p>Het is nu ongeveer een week geleden dat jullie document klaar was. Soms helpt het om even terug te blikken: is er al iets veranderd, en waar ligt nog werk?</p>
            <p>Je kan jullie opvolgdocument invullen wanneer het jou past, samen met de andere deelnemer.</p>
            <p style="margin:28px 0">
              <a href="${link}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Vul jullie opvolging in</a>
            </p>
            <p style="color:#888;font-size:.85rem">Dit is een eenmalige herinnering. Je kan de opvolging ook altijd zelf starten via Mijn gesprekken, op eender welk moment.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon opvolg-herinnering niet versturen:', err);
  }
}

exports.handler = async () => {
  try {
    const supabase = getSupabase();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Zoek documenten die minstens 7 dagen oud zijn, waarvan de sessie nog
    // op 'klaar' staat (dus geen check-in ronde al gestart) en waarvoor nog
    // geen herinnering verstuurd is.
    const { data: candidates } = await supabase
      .from('sessions')
      .select('id, plan, followup_reminder_sent, documents(created_at)')
      .eq('status', 'klaar')
      .eq('followup_reminder_sent', false)
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
      if (oldestDoc.created_at > sevenDaysAgo) continue;

      const { data: participants } = await supabase
        .from('participants')
        .select('display_name, email, access_token')
        .eq('session_id', session.id);

      await Promise.all(
        (participants || [])
          .filter(p => p.email)
          .map(p => sendReminderEmail(p.email, p.display_name, `${siteUrl}/story.html?token=${p.access_token}`))
      );

      await supabase
        .from('sessions')
        .update({ followup_reminder_sent: true })
        .eq('id', session.id);

      processed++;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, processed }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
