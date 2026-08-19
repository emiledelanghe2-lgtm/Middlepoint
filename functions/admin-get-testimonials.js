const { getSupabase } = require('./_supabase');
const { checkAdminAuth } = require('./_admin-auth');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password } = JSON.parse(event.body || '{}');
    const authCheck = await checkAdminAuth(event, password);
    if (!authCheck.ok) {
      return { statusCode: authCheck.statusCode, body: JSON.stringify({ error: authCheck.error }) };
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
