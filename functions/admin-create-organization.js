const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password, name, sessionLimit } = JSON.parse(event.body || '{}');
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Verkeerd wachtwoord.' }) };
    }
    if (!name || !name.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Naam van het bedrijf is verplicht.' }) };
    }
    const limit = parseInt(sessionLimit, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Geef een geldig aantal gesprekken op (groter dan 0).' }) };
    }
    const supabase = getSupabase();
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const { data: organization, error } = await supabase
      .from('organizations')
      .insert({
        name: name.trim(),
        session_limit: limit,
        sessions_used_this_period: 0,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ organization }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
