const { getSupabase } = require('./_supabase');
const { checkAdminAuth } = require('./_admin-auth');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password, id, action } = JSON.parse(event.body || '{}');
    const authCheck = await checkAdminAuth(event, password);
    if (!authCheck.ok) {
      return { statusCode: authCheck.statusCode, body: JSON.stringify({ error: authCheck.error }) };
    }
    if (!id || !['approved', 'rejected'].includes(action)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Ongeldige aanvraag.' }) };
    }
    const supabase = getSupabase();
    await supabase.from('testimonials').update({ status: action }).eq('id', id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
