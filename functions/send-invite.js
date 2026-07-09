const { emailButtonHtml } = require('./_email-button');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { toEmail, fromName, toName, accessLink, category, customMessage } = JSON.parse(event.body || '{}');
    if (!toEmail || !fromName || !accessLink) {
      return { statusCode: 400, body: JSON.stringify({ error: 'toEmail, fromName en accessLink zijn verplicht.' }) };
    }
    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: 'E-mailverzending is nog niet ingesteld (RESEND_API_KEY ontbreekt).' }) };
    }
    const subject = `${fromName} wil graag iets met jou uitklaren via Middlepoint`;
    const personalBlock = customMessage && customMessage.trim()
      ? `<div style="background:#F1DCC9;border-radius:8px;padding:16px;margin:20px 0"><p style="margin:0;font-style:italic">"${customMessage.trim()}"</p></div>`
      : '';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <h2 style="color:#2C3A52">Hey${toName ? ' ' + toName : ''},</h2>
        <p><strong>${fromName}</strong> heeft een gesprek gestart op Middlepoint.</p>
        ${personalBlock}
        <p>Middlepoint is een tool waarmee twee kanten van een verhaal apart en anoniem hun kant kunnen delen via een korte vragenlijst. Op basis daarvan wordt een eerlijk, neutraal overzicht opgesteld dat helpt om elkaar beter te begrijpen, nog voor jullie er zelf een gesprek over voeren. Er wordt geen schuldige aangewezen, en niemand leest jouw antwoorden rechtstreeks, ook ${fromName} niet.</p>
        <p>${fromName} heeft al zijn of haar kant ingevuld (categorie: ${category || 'algemeen'}), en zou het waarderen als jij ook jouw kant deelt.</p>
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
        to: toEmail,
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
