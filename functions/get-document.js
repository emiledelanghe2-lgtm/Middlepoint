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

    const session = participant.sessions;
    const isThirdPartyOrganizer = participant.is_organizer && session.organizer_participates === false;

    if (participant.is_organizer && !session.organizer_sees_document) {
      return { statusCode: 403, body: JSON.stringify({ error: 'De organisator heeft geen toegang tot dit document.' }) };
    }

    if (!participant.is_organizer && session.organizer_participates === false && session.participants_receive_document === false) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Dit document is enkel zichtbaar voor de organisator van dit gesprek.' }) };
    }

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('session_id', participant.session_id)
      .order('version', { ascending: false });

    const { data: allParticipants } = await supabase
      .from('participants')
      .select('display_name, email')
      .eq('session_id', participant.session_id);
    const missingEmailNames = (allParticipants || [])
      .filter(p => !p.email)
      .map(p => p.display_name);

    const plan = session.plan || 'gratis';
    const isPaid = plan !== 'gratis';
    return {
      statusCode: 200,
      body: JSON.stringify({
        myName: participant.display_name,
        isThirdPartyViewer: isThirdPartyOrganizer,
        sessionStatus: session.status,
        category: session.category,
        isPaid,
        missingEmailNames,
        documents: documents || [],
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
