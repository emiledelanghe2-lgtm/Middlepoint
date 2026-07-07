const { getSupabase } = require('./_supabase');

async function sendReminderEmail(toEmail, toName, fromName, link) {
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
        subject: `Even herinneren, ${fromName} wacht op jouw kant van het verhaal`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p>Een paar dagen geleden startte <strong>${fromName}</strong> een gesprek via Middlepoint, maar we merken dat jouw kant van het verhaal nog niet is ingevuld.</p>
            <p>Zonder jouw antwoorden kan er nog geen gezamenlijk overzicht ontstaan. Het duurt maar een paar minuten.</p>
            <p style="margin:28px 0">
              <a href="${link}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Mijn kant van het verhaal vertellen</a>
            </p>
            <p style="color:#888;font-size:.85rem">Dit is een eenmalige herinnering. Als je dit al ingevuld hebt, mag je deze mail negeren.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon verhaal-herinnering niet versturen:', err);
  }
}

exports.handler = async () => {
  try {
    const supabase = getSupabase();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await supabase
      .from('sessions')
      .select('id, organizer_role, created_at, story_reminder_sent')
      .eq('status', 'wachten_op_verhalen')
      .eq('story_reminder_sent', false)
      .lt('created_at', threeDaysAgo);

    if (!candidates || !candidates.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, processed: 0 }) };
    }

    let processed = 0;

    for (const session of candidates) {
      const { data: participants } = await supabase
        .from('participants')
        .select('id, display_name, email, is_organizer')
        .eq('session_id', session.id);

      if (!participants || !participants.length) continue;

      const realParticipants = participants.filter(p => !(p.is_organizer && session.organizer_role));

      const { data: round1Entries } = await supabase
        .from('entries')
        .select('participant_id')
        .eq('session_id', session.id)
        .eq('round', 1);

      const submittedIds = new Set((round1Entries || []).map(e => e.participant_id));
      const organizer = participants.find(p => p.is_organizer);
      const notSubmitted = realParticipants.filter(p => !submittedIds.has(p.id) && p.email);

      if (notSubmitted.length) {
        await Promise.all(
          notSubmitted.map(p => {
            const link = `/story.html?token=${p.access_token || ''}`;
            return sendReminderEmail(p.email, p.display_name, organizer ? organizer.display_name : 'Iemand', link);
          })
        );
      }

      await supabase
        .from('sessions')
        .update({ story_reminder_sent: true })
        .eq('id', session.id);

      processed++;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, processed }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
