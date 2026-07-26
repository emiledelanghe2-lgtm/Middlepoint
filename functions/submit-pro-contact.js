exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
   const { name, email, orgType, orgName, volume, message } = JSON.parse(event.body || '{}');
    if (!name || !email || !orgType || !orgName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Naam, e-mailadres, type en naam van de organisatie zijn verplicht.' }) };
    }
    if (!process.env.RESEND_API_KEY) {
      return { statusCode: 503, body: JSON.stringify({ error: 'E-mailverzending is nog niet ingesteld.' }) };
    }

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
        <h2 style="color:#3A4A5C">Nieuwe Pro-aanvraag</h2>
        <p><strong>Naam:</strong> ${name}</p>
        <p><strong>E-mailadres:</strong> ${email}</p>
<p><strong>Type organisatie:</strong> ${orgType}</p>
        <p><strong>Naam organisatie:</strong> ${orgName}</p>
        <p><strong>Geschat aantal gesprekken per maand:</strong> ${volume || 'niet opgegeven'}</p>
        ${message ? `<p><strong>Bericht:</strong><br>${message}</p>` : ''}
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Middlepoint <onboarding@resend.dev>',
        to: 'middlepoint@zohomail.eu',
        reply_to: email,
        subject: `Pro-aanvraag: ${name} (${orgType})`,
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
