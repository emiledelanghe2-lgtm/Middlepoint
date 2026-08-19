const { getSupabase } = require('./_supabase');
const { checkAdminAuth } = require('./_admin-auth');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password, organizationId } = JSON.parse(event.body || '{}');
    const authCheck = await checkAdminAuth(event, password);
    if (!authCheck.ok) {
      return { statusCode: authCheck.statusCode, body: JSON.stringify({ error: authCheck.error }) };
    }
    if (!organizationId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'organizationId is verplicht.' }) };
    }
    const supabase = getSupabase();
    const { error } = await supabase.from('organizations').delete().eq('id', organizationId);
    if (error) {
      if (error.message && (error.message.includes('foreign key') || error.code === '23503')) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: 'Dit bedrijf heeft al gesprekken gestart en kan daarom niet volledig verwijderd worden. Verwijder eventueel eerst alle leden om het onbruikbaar te maken, of zet de limiet gewoon op 0.' }),
        };
      }
      throw error;
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
