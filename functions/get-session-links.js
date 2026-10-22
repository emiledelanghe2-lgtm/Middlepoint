const { getSupabase } = require('./_supabase');
const { reqLang, normLang, pre, tr } = require('./_lang');

exports.handler = async (event) => {
  try {
    const token = event.queryStringParameters && event.queryStringParameters.token;
    let L = reqLang(event);
    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'token is verplicht.', 'token is required.') }) };
    }
    const supabase = getSupabase();
    const { data: participant, error: pError } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (pError || !participant) {
      return { statusCode: 404, body: JSON.stringify({ error: tr(L, 'Ongeldige link.', 'Invalid link.') }) };
    }
    L = normLang(participant.sessions.lang);
    if (!participant.is_organizer) {
      return { statusCode: 403, body: JSON.stringify({ error: tr(L, 'Enkel de organisator kan alle links bekijken.', 'Only the organizer can view all links.') }) };
    }
    const { data: allParticipants, error: apError } = await supabase
      .from('participants')
      .select('id, display_name, access_token, is_organizer, email')
      .eq('session_id', participant.session_id);
    if (apError) throw apError;
    return {
      statusCode: 200,
      body: JSON.stringify({
        links: allParticipants.map(p => ({
          id: p.id,
          name: p.display_name,
          isOrganizer: p.is_organizer,
          email: p.email,
          accessLink: `${pre(L)}/story.html?token=${p.access_token}`,
        })),
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
