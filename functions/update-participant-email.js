const { getSupabase } = require('./_supabase');

async function sendEmailChangedNotice(toEmail, toName, accessLink, siteUrl) {
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
        subject: 'Je e-mailadres bij Middlepoint is aangepast',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
            <h2 style="color:#3A4A5C">Hey${toName ? ' ' + toName : ''},</h2>
            <p>De organisator van jullie gesprek op Middlepoint heeft dit e-mailadres ingesteld voor jou, ter vervanging van een eerder, foutief adres.</p>
            <p>Dit is jouw persoonlijke link voor het gesprek:</p>
            <p style="margin:28px 0">
              <a href="${siteUrl}${accessLink}" style="background:#C9714B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Naar mijn gesprek</a>
            </p>
            <p style="color:#888;font-size:.85rem">Kijk ook zeker even bij je ongewenste mail of spam als je verdere mails van ons verwacht en ze niet ziet binnenkomen. Herken je dit gesprek niet, dan kan je deze mail gerust negeren.</p>
          </div>`,
      }),
    });
  } catch (err) {
    console.error('Kon e-mailadres-gewijzigd-mail niet versturen:', err);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { organizerToken, participantId, newEmail } = JSON.parse(event.body || '{}');
    if (!organizerToken || !participantId || !newEmail || !newEmail.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'organizerToken, participantId en newEmail zijn verplicht.' }) };
    }
    const normalizedEmail = newEmail.toLowerCase().trim();
    if (!normalizedEmail.includes('@')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Vul een geldig e-mailadres in.' }) };
    }

    const supabase = getSupabase();
    const { data: organizerParticipant, error: oError } = await supabase
      .from('participants')
      .select('id, session_id, is_organizer')
      .eq('access_token', organizerToken)
      .single();
    if (oError || !organizerParticipant || !organizerParticipant.is_organizer) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Enkel de organisator kan e-mailadressen van deelnemers wijzigen.' }) };
    }

    const { data: targetParticipant, error: tError } = await supabase
      .from('participants')
      .select('id, session_id, display_name, access_token, is_organizer')
      .eq('id', participantId)
      .single();
    if (tError || !targetParticipant || targetParticipant.session_id !== organizerParticipant.session_id) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Deelnemer niet gevonden binnen dit gesprek.' }) };
    }
    if (targetParticipant.is_organizer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Het e-mailadres van de organisator zelf kan hier niet gewijzigd worden. Neem contact op met Middlepoint als dat nodig is.' }) };
    }

    await supabase.from('participants').update({ email: normalizedEmail }).eq('id', participantId);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    await sendEmailChangedNotice(normalizedEmail, targetParticipant.display_name, `/story.html?token=${targetParticipant.access_token}`, siteUrl);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
