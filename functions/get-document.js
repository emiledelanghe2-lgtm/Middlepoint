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

    // Als de organisator een pure derde partij is en besliste dat de deelnemers het
    // document niet zelf te zien krijgen, blokkeren we de toegang voor die deelnemers.
    if (!participant.is_organizer && session.organizer_participates === false && session.participants_receive_document === false) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Dit document is enkel zichtbaar voor de organisator van dit gesprek.' }) };
    }

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('session_id', participant.session_id)
      .order('version', { ascending: false });
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
        documents: documents || [],
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
