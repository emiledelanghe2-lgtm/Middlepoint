const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: 'token ontbreekt.' }) };
  }
  try {
    const supabase = getSupabase();
    const { data: participant, error: pError } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (pError || !participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige of verlopen link.' }) };
    }
    const { data: allParticipants } = await supabase
      .from('participants')
      .select('id, display_name, is_organizer')
      .eq('session_id', participant.session_id);
    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('session_id', participant.session_id)
      .order('round', { ascending: true });
    const { data: followups } = await supabase
      .from('followup_questions')
      .select('*')
      .eq('participant_id', participant.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const round1SubmittedIds = new Set((entries || []).filter(e => e.round === 1).map(e => e.participant_id));
    const participantsStatus = (allParticipants || [])
      .filter(p => !(p.is_organizer && participant.sessions.organizer_participates === false))
      .map(p => ({ name: p.display_name, submitted: round1SubmittedIds.has(p.id) }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        participant: { id: participant.id, name: participant.display_name, isOrganizer: participant.is_organizer },
        session: participant.sessions,
        allParticipants,
        participantsStatus,
        myEntries: (entries || []).filter(e => e.participant_id === participant.id),
        otherEntriesCount: (entries || []).filter(e => e.participant_id !== participant.id).length,
        myFollowups: followups && followups.length ? followups[0].questions : null,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
