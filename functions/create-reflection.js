const { getSupabase } = require('./_supabase');
const { reqLang, tr } = require('./_lang');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
const { email, name, category, content, perspective, thirdPartyContext, lang } = JSON.parse(event.body || '{}');
    const L = reqLang(event, lang);
    if (!email || !category || !content || !content.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'E-mailadres, categorie en antwoorden zijn verplicht.', 'Email address, category and answers are required.') }) };
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail.includes('@')) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'Vul een geldig e-mailadres in.', 'Please enter a valid email address.') }) };
    }

    const supabase = getSupabase();
    const { data: reflection, error } = await supabase
      .from('reflections')
.insert({
        email: normalizedEmail,
        name: name || null,
        category,
        raw_content: content,
        perspective: perspective || 'zelf',
        third_party_context: thirdPartyContext || null,
        status: 'bezig',
        // Only written for English reflections, so Dutch ones work even before migration 009 ran.
        ...(L === 'en' ? { lang: 'en' } : {}),
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
