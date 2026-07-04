const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, category } = JSON.parse(event.body || '{}');
    if (!token || !category) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token en category zijn verplicht.' }) };
    }
    const supabase = getSupabase();
    const { data: participant } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }
    // Enkel aanpasbaar zolang het document nog niet gegenereerd wordt
    const status = participant.sessions.status || '';
    const locked = status === 'document_genereren' || status === 'klaar' || status.startsWith('nieuwe_ronde_');
    if (locked) {
      return { statusCode: 400, body: JSON.stringify({ error: 'De categorie kan niet meer aangepast worden op dit moment.' }) };
    }
    await supabase
      .from('sessions')
      .update({ category, updated_at: new Date().toISOString() })
      .eq('id', participant.session_id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
