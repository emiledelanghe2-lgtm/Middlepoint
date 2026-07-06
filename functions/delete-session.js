const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { magicToken, sessionId } = JSON.parse(event.body || '{}');
    if (!magicToken || !sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'magicToken en sessionId zijn verplicht.' }) };
    }
    const supabase = getSupabase();
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('magic_link_token', magicToken)
      .maybeSingle();
    if (!customer || new Date(customer.magic_link_expires) < new Date()) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Ongeldige of verlopen link.' }) };
    }
    // Controleer dat dit e-mailadres effectief deelnemer is van deze sessie,
    // zodat niemand een sessie kan verwijderen die niet van hem is.
    const { data: participant } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', sessionId)
      .eq('email', customer.email)
      .maybeSingle();
    if (!participant) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Je hebt geen toegang tot dit gesprek.' }) };
    }
    // Cascade delete via de database-relaties verwijdert automatisch
    // participants, entries en documents die aan deze sessie hangen.
    await supabase.from('sessions').delete().eq('id', sessionId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
