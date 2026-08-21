const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { content, displayName, isAnonymous, rating } = JSON.parse(event.body || '{}');
    if (!content || content.trim().length < 10) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Schrijf een iets uitgebreidere getuigenis (minstens 10 tekens).' }) };
    }
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Kies een score tussen 1 en 5 sterren.' }) };
    }
    const supabase = getSupabase();
    await supabase.from('testimonials').insert({
      display_name: isAnonymous ? null : (displayName || null),
      is_anonymous: !!isAnonymous,
      content: content.trim(),
      rating: ratingNum,
      status: 'pending',
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
