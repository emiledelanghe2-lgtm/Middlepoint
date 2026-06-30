const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  try {
    const token = event.queryStringParameters && event.queryStringParameters.token;
    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token is verplicht.' }) };
    }
    const supabase = getSupabase();
    const { data: participant, error: pError } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (pError || !participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }
    if (!participant.is_organizer) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Enkel de organisator kan alle links bekijken.' }) };
    }
    const { data: allParticipants, error: apError } = await supabase
      .from('participants')
      .select('display_name, access_token, is_organizer')
      .eq('session_id', participant.session_id);
    if (apError) throw apError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        links: allParticipants.map(p => ({
          name: p.display_name,
          isOrganizer: p.is_organizer,
          accessLink: `/story.html?token=${p.access_token}`,
        })),
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
