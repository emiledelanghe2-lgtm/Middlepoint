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
    const { reflectionId } = JSON.parse(event.body || '{}');
    if (!reflectionId) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'reflectionId is verplicht.', 'reflectionId is required.') }) };
    }
    const supabase = getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData || !userData.user) {
      return { statusCode: 401, body: JSON.stringify({ error: tr(L, 'Je sessie is verlopen. Log opnieuw in.', 'Your session has expired. Please log in again.') }) };
    }
    const email = userData.user.email.toLowerCase().trim();

    const { data: reflection } = await supabase
      .from('reflections')
      .select('id, email')
      .eq('id', reflectionId)
      .maybeSingle();
    if (!reflection || reflection.email !== email) {
      return { statusCode: 403, body: JSON.stringify({ error: tr(L, 'Je hebt geen toegang tot deze reflectie.', 'You do not have access to this reflection.') }) };
    }
    await supabase.from('reflections').delete().eq('id', reflectionId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
