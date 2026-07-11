const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { email, name, relationType, content } = JSON.parse(event.body || '{}');
    if (!email || !content || !content.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'E-mailadres en antwoorden zijn verplicht.' }) };
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail.includes('@')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Vul een geldig e-mailadres in.' }) };
    }

    const supabase = getSupabase();
    const { data: reflection, error } = await supabase
      .from('reflections')
      .insert({
        email: normalizedEmail,
        name: name || null,
        relation_type: relationType || null,
        raw_content: content,
        status: 'bezig',
      })
      .select()
      .single();
    if (error) throw error;

    const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
    try {
      await fetch(`${siteUrl}/.netlify/functions/generate-reflection-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflectionId: reflection.id }),
      });
    } catch (e) {
      console.error('Kon reflectie-generatie niet triggeren:', e);
    }

    return { statusCode: 200, body: JSON.stringify({ token: reflection.access_token }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
