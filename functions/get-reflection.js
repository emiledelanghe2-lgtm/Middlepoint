const { getSupabase } = require('./_supabase');
const { reqLang, tr } = require('./_lang');

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  const L = reqLang(event);
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'token ontbreekt.', 'token is missing.') }) };
  }
  try {
    const supabase = getSupabase();
    const { data: reflection } = await supabase
      .from('reflections')
      .select('*')
      .eq('access_token', token)
      .single();
    if (!reflection) {
      return { statusCode: 404, body: JSON.stringify({ error: tr(L, 'Reflectie niet gevonden.', 'Reflection not found.') }) };
    }
    return { statusCode: 200, body: JSON.stringify({ reflection }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
