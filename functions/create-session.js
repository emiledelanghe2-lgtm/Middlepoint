const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const { category, organizerName, participantNames, participantEmails, organizerRole, organizerEmail, organizerSeesDocument, plan } = body;
    if (!category || !organizerName || !organizerEmail || !Array.isArray(participantNames) || participantNames.length < 1) {
      return { statusCode: 400, body: JSON.stringify({ error: 'category, organizerName, organizerEmail en minstens 1 participantNames zijn verplicht.' }) };
    }
    const emails = Array.isArray(participantEmails) ? participantEmails : [];
    const supabase = getSupabase();
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        category,
        organizer_role: organizerRole || null,
        organizer_email: organizerEmail || null,
        organizer_sees_document: organizerSeesDocument !== false,
        plan: plan || 'gratis',
      })
      .select()
      .single();
    if (sessionError) throw sessionError;

    const isOrganizerAlsoParticipant = !organizerRole;
    let participantsToInsert;
    if (isOrganizerAlsoParticipant) {
      participantsToInsert = [organizerName, ...participantNames].map((name, i) => ({
        session_id: session.id,
        display_name: name,
        is_organizer: i === 0,
        email: i === 0 ? (organizerEmail || null) : (emails[i - 1] || null),
      }));
    } else {
      participantsToInsert = participantNames.map((name, i) => ({
        session_id: session.id,
        display_name: name,
        is_organizer: false,
        email: emails[i] || null,
      }));
      participantsToInsert.push({
        session_id: session.id,
        display_name: organizerName,
        is_organizer: true,
        email: organizerEmail || null,
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
