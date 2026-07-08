const { getSupabase } = require('./_supabase');
const crypto = require('crypto');

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'token ontbreekt.' }) };
  }
  try {
    const supabase = getSupabase();
    const { data: participant } = await supabase
      .from('participants')
      .select('id, email')
      .eq('access_token', token)
      .single();
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }
    if (!participant.email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Geen e-mailadres gekoppeld aan dit gesprek.' }) };
    }
    const email = participant.email.toLowerCase().trim();

    const magicToken = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (existingCustomer) {
      await supabase.from('customers').update({ magic_link_token: magicToken, magic_link_expires: expires }).eq('email', email);
    } else {
      await supabase.from('customers').insert({ email, magic_link_token: magicToken, magic_link_expires: expires, plan: 'gratis' });
    }

    return { statusCode: 200, body: JSON.stringify({ link: `/mijn-gesprekken.html?token=${magicToken}` }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
