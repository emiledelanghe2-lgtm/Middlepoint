const { emailButtonHtml } = require('./_email-button');
const { getSupabase } = require('./_supabase');

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { organizerToken, participantId, category, customMessage } = JSON.parse(event.body || '{}');
    if (!organizerToken || !participantId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'organizerToken en participantId zijn verplicht.' }) };
    }
    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: 'E-mailverzending is nog niet ingesteld (RESEND_API_KEY ontbreekt).' }) };
    }

    const supabase = getSupabase();
    const { data: organizerParticipant, error: oError } = await supabase
      .from('participants')
      .select('id, session_id, is_organizer')
      .eq('access_token', organizerToken)
      .single();
    if (oError || !organizerParticipant || !organizerParticipant.is_organizer) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Enkel de organisator kan uitnodigingen versturen voor dit gesprek.' }) };
    }

    const { data: targetParticipant, error: tError } = await supabase
      .from('participants')
      .select('id, session_id, display_name, email, access_token, is_organizer')
      .eq('id', participantId)
      .single();
    if (tError || !targetParticipant || targetParticipant.session_id !== organizerParticipant.session_id) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Deelnemer niet gevonden binnen dit gesprek.' }) };
    }
    if (targetParticipant.is_organizer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'De organisator stuurt zichzelf geen uitnodiging.' }) };
    }
    if (!targetParticipant.email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Voor deze deelnemer is geen e-mailadres gekend.' }) };
    }

    const { data: organizerRow } = await supabase
      .from('participants')
      .select('display_name')
      .eq('id', organizerParticipant.id)
      .single();
    const fromName = (organizerRow && organizerRow.display_name) || 'Iemand';

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    const accessLink = `${siteUrl}/story.html?token=${targetParticipant.access_token}`;

    const safeFromName = escHtml(fromName);
    const safeToName = escHtml(targetParticipant.display_name);
    const safeCategory = escHtml(category);
    const subject = `${fromName} wil graag iets met jou uitklaren via Middlepoint`;
    const personalBlock = customMessage && String(customMessage).trim()
      ? `<div style="background:#F1DCC9;border-radius:8px;padding:16px;margin:20px 0"><p style="margin:0;font-style:italic">"${escHtml(String(customMessage).trim())}"</p></div>`
      : '';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <h2 style="color:#2C3A52">Hey${safeToName ? ' ' + safeToName : ''},</h2>
        <p><strong>${safeFromName}</strong> heeft een gesprek gestart op Middlepoint.</p>
        ${personalBlock}
        <p>Middlepoint is een tool waarmee twee kanten van een verhaal apart en anoniem hun kant kunnen delen via een korte vragenlijst. Op basis daarvan wordt een eerlijk, neutraal overzicht opgesteld dat helpt om elkaar beter te begrijpen, nog voor jullie er zelf een gesprek over voeren. Er wordt geen schuldige aangewezen, en niemand leest jouw antwoorden rechtstreeks, ook ${safeFromName} niet.</p>
        <p>${safeFromName} heeft al zijn of haar kant ingevuld (categorie: ${safeCategory || 'algemeen'}), en zou het waarderen als jij ook jouw kant deelt.</p>
        ${emailButtonHtml(accessLink, 'Mijn kant van het verhaal vertellen', '#C76F46')}
        <p style="color:#888;font-size:.85rem">Dit is geen rechtszaak en geen beschuldiging, gewoon een eerlijke start voor een gesprek.</p>
      </div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Middlepoint <onboarding@resend.dev>',
        to: targetParticipant.email,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend fout (${res.status}): ${text}`);
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
