const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password } = JSON.parse(event.body || '{}');
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Verkeerd wachtwoord.' }) };
    }
    const supabase = getSupabase();
    const { data: testimonials } = await supabase
      .from('testimonials')
      .select('*')
      .order('created_at', { ascending: false });
    return { statusCode: 200, body: JSON.stringify({ testimonials: testimonials || [] }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
