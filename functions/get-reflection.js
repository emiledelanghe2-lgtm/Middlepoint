const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'token ontbreekt.' }) };
  }
  try {
    const supabase = getSupabase();
    const { data: reflection } = await supabase
      .from('reflections')
      .select('*')
      .eq('access_token', token)
      .single();
    if (!reflection) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Reflectie niet gevonden.' }) };
    }
    return { statusCode: 200, body: JSON.stringify({ reflection }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
