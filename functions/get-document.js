const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'token ontbreekt.' }) };
  }
  try {
    const supabase = getSupabase();
    const { data: participant } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }
    if (participant.is_organizer && !participant.sessions.organizer_sees_document) {
      return { statusCode: 403, body: JSON.stringify({ error: 'De organisator heeft geen toegang tot dit document.' }) };
    }
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('session_id', participant.session_id)
      .order('version', { ascending: false });

    const plan = participant.sessions.plan || 'gratis';
    const isPaid = plan !== 'gratis';

    return {
      statusCode: 200,
      body: JSON.stringify({
        myName: participant.display_name,
        sessionStatus: participant.sessions.status,
        isPaid,
        documents: documents || [],
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
