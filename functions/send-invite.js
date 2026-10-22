const { emailButtonHtml } = require('./_email-button');
const { getSupabase } = require('./_supabase');
const { reqLang, pre, tr, categoryLabel, greeting } = require('./_lang');

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { organizerToken, participantId, category, customMessage, lang } = JSON.parse(event.body || '{}');
    const L = reqLang(event, lang);
    if (!organizerToken || !participantId) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'organizerToken en participantId zijn verplicht.', 'organizerToken and participantId are required.') }) };
    }
    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: tr(L, 'E-mailverzending is nog niet ingesteld (RESEND_API_KEY ontbreekt).', 'Email sending is not set up yet (RESEND_API_KEY missing).') }) };
    }

    const supabase = getSupabase();
    const { data: organizerParticipant, error: oError } = await supabase
      .from('participants')
      .select('id, session_id, is_organizer')
      .eq('access_token', organizerToken)
      .single();
    if (oError || !organizerParticipant || !organizerParticipant.is_organizer) {
      return { statusCode: 403, body: JSON.stringify({ error: tr(L, 'Enkel de organisator kan uitnodigingen versturen voor dit gesprek.', 'Only the organizer can send invitations for this conversation.') }) };
    }

    const { data: targetParticipant, error: tError } = await supabase
      .from('participants')
      .select('id, session_id, display_name, email, access_token, is_organizer')
      .eq('id', participantId)
      .single();
    if (tError || !targetParticipant || targetParticipant.session_id !== organizerParticipant.session_id) {
      return { statusCode: 404, body: JSON.stringify({ error: tr(L, 'Deelnemer niet gevonden binnen dit gesprek.', 'Participant not found in this conversation.') }) };
    }
    if (targetParticipant.is_organizer) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'De organisator stuurt zichzelf geen uitnodiging.', 'The organizer does not send an invitation to themselves.') }) };
    }
    if (!targetParticipant.email) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'Voor deze deelnemer is geen e-mailadres gekend.', 'No email address is known for this participant.') }) };
    }

    const { data: organizerRow } = await supabase
      .from('participants')
      .select('display_name')
      .eq('id', organizerParticipant.id)
      .single();
    const fromName = (organizerRow && organizerRow.display_name) || tr(L, 'Iemand', 'Someone');

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    const accessLink = `${siteUrl}${pre(L)}/story.html?token=${targetParticipant.access_token}`;

    const safeFromName = escHtml(fromName);
    const safeToName = escHtml(targetParticipant.display_name);
    const safeCategory = escHtml(L === 'en' ? categoryLabel(L, category) : category);
    const subject = tr(L, `${fromName} wil graag iets met jou uitklaren via Middlepoint`, `${fromName} would like to sort something out with you via Middlepoint`);
    const personalBlock = customMessage && String(customMessage).trim()
      ? `<div style="background:#F1DCC9;border-radius:8px;padding:16px;margin:20px 0"><p style="margin:0;font-style:italic">"${escHtml(String(customMessage).trim())}"</p></div>`
      : '';
    const htmlEn = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <h2 style="color:#2C3A52">${greeting('en', safeToName)}</h2>
        <p><strong>${safeFromName}</strong> has started a conversation on Middlepoint.</p>
        ${personalBlock}
        <p>Middlepoint is a tool that lets both sides of a story share their side separately and anonymously via a short questionnaire. Based on that, an honest, neutral overview is prepared that helps you understand each other better, before you even have a conversation about it yourselves. Nobody is blamed, and nobody reads your answers directly, not even ${safeFromName}.</p>
        <p>${safeFromName} has already filled in their side (category: ${safeCategory || 'general'}), and would appreciate it if you shared yours too.</p>
        ${emailButtonHtml(accessLink, 'Share my side of the story', '#C76F46')}
        <p style="color:#888;font-size:.85rem">This is not a lawsuit and not an accusation, just an honest start for a conversation.</p>
      </div>`;
    const htmlNl = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <h2 style="color:#2C3A52">Hey${safeToName ? ' ' + safeToName : ''},</h2>
        <p><strong>${safeFromName}</strong> heeft een gesprek gestart op Middlepoint.</p>
        ${personalBlock}
        <p>Middlepoint is een tool waarmee twee kanten van een verhaal apart en anoniem hun kant kunnen delen via een korte vragenlijst. Op basis daarvan wordt een eerlijk, neutraal overzicht opgesteld dat helpt om elkaar beter te begrijpen, nog voor jullie er zelf een gesprek over voeren. Er wordt geen schuldige aangewezen, en niemand leest jouw antwoorden rechtstreeks, ook ${safeFromName} niet.</p>
        <p>${safeFromName} heeft al zijn of haar kant ingevuld (categorie: ${safeCategory || 'algemeen'}), en zou het waarderen als jij ook jouw kant deelt.</p>
        ${emailButtonHtml(accessLink, 'Mijn kant van het verhaal vertellen', '#C76F46')}
        <p style="color:#888;font-size:.85rem">Dit is geen rechtszaak en geen beschuldiging, gewoon een eerlijke start voor een gesprek.</p>
      </div>`;
    const html = L === 'en' ? htmlEn : htmlNl;
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
