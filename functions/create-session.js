const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { category, organizerName, participantNames, organizerRole, organizerSeesDocument } = body;

    if (!category || !organizerName || !Array.isArray(participantNames) || participantNames.length < 1) {
      return { statusCode: 400, body: JSON.stringify({ error: 'category, organizerName en minstens 1 participantNames zijn verplicht.' }) };
    }

    const supabase = getSupabase();

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        category,
        organizer_role: organizerRole || null,
        organizer_sees_document: organizerSeesDocument !== false,
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    const isOrganizerAlsoParticipant = !organizerRole;
    const allNames = isOrganizerAlsoParticipant
      ? [organizerName, ...participantNames]
      : participantNames;

    const participantsToInsert = allNames.map((name, i) => ({
      session_id: session.id,
      display_name: name,
      is_organizer: isOrganizerAlsoParticipant ? i === 0 : false,
    }));

    if (!isOrganizerAlsoParticipant) {
      participantsToInsert.push({
        session_id: session.id,
        display_name: organizerName,
        is_organizer: true,
      });
    }

    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .insert(participantsToInsert)
      .select();

    if (participantsError) throw participantsError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId: session.id,
        participants: participants.map(p => ({
          id: p.id,
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
