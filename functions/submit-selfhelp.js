const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, content } = JSON.parse(event.body || '{}');
    if (!token || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token en content zijn verplicht.' }) };
    }
    const supabase = getSupabase();
    const { data: reflection } = await supabase
      .from('reflections')
      .select('id')
      .eq('access_token', token)
      .single();
    if (!reflection) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Reflectie niet gevonden.' }) };
    }

    await supabase.from('reflections').update({
      self_help_answers: content,
      self_help_status: 'bezig',
    }).eq('id', reflection.id);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    try {
      await fetch(`${siteUrl}/.netlify/functions/generate-selfhelp-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflectionId: reflection.id }),
      });
    } catch (e) {
      console.error('Kon selfhelp-generatie niet triggeren:', e);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
