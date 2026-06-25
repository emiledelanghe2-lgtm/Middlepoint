// Vereist de environment variable RESEND_API_KEY (zie README voor setup).
// Zolang die niet ingesteld is, geeft deze function een duidelijke foutmelding terug
// in plaats van te crashen -- de rest van de site blijft gewoon werken zonder e-mail.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { toEmail, fromName, toName, accessLink, category } = JSON.parse(event.body || '{}');

    if (!toEmail || !fromName || !accessLink) {
      return { statusCode: 400, body: JSON.stringify({ error: 'toEmail, fromName en accessLink zijn verplicht.' }) };
    }

    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: 'E-mailverzending is nog niet ingesteld (RESEND_API_KEY ontbreekt).' }) };
    }

    const subject = `${fromName} wil graag iets met jou uitklaren via Middlepoint`;
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <h2 style="color:#2C3A52">Hey${toName ? ' ' + toName : ''},</h2>
        <p><strong>${fromName}</strong> heeft een gesprek gestart op Middlepoint, een tool om twee kanten van een verhaal eerlijk naast elkaar te leggen -- zonder dat iemand de schuldige aangewezen wordt.</p>
        <p>${fromName} heeft al zijn/haar kant geschreven, en zou het waarderen als jij ook jouw kant van het verhaal deelt (categorie: ${category || 'algemeen'}). Het is anoniem te lezen voor jou totdat het verwerkt is tot een neutraal document.</p>
        <p style="margin:28px 0">
          <a href="${accessLink}" style="background:#C76F46;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Mijn kant van het verhaal vertellen</a>
        </p>
        <p style="color:#888;font-size:.85rem">Dit is geen rechtszaak en geen beschuldiging -- gewoon een eerlijke start voor een gesprek.</p>
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
