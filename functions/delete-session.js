const { getSupabase } = require('./_supabase');
const { reqLang, tr } = require('./_lang');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const L = reqLang(event);
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) {
      return { statusCode: 401, body: JSON.stringify({ error: tr(L, 'Niet ingelogd.', 'Not logged in.') }) };
    }
    const { sessionId } = JSON.parse(event.body || '{}');
    if (!sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'sessionId is verplicht.', 'sessionId is required.') }) };
    }
    const supabase = getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData || !userData.user) {
      return { statusCode: 401, body: JSON.stringify({ error: tr(L, 'Je sessie is verlopen. Log opnieuw in.', 'Your session has expired. Please log in again.') }) };
    }
    const email = userData.user.email.toLowerCase().trim();

    const { data: participant } = await supabase
      .from('participants')
      .select('id')
      .eq('session_id', sessionId)
      .eq('email', email)
      .maybeSingle();
    if (!participant) {
      return { statusCode: 403, body: JSON.stringify({ error: tr(L, 'Je hebt geen toegang tot dit gesprek.', 'You do not have access to this conversation.') }) };
    }
    await supabase.from('sessions').delete().eq('id', sessionId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
