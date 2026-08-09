const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Niet ingelogd.' }) };
    }
    const { sessionId } = JSON.parse(event.body || '{}');
    if (!sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'sessionId is verplicht.' }) };
    }
    const supabase = getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData || !userData.user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Je sessie is verlopen. Log opnieuw in.' }) };
    }
    const email = userData.user.email.toLowerCase().trim();

    const { data: participant } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', sessionId)
      .eq('email', email)
      .maybeSingle();
    if (!participant) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Je hebt geen toegang tot dit gesprek.' }) };
    }
    await supabase.from('sessions').delete().eq('id', sessionId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
