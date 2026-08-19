const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, content, isAnonymous } = JSON.parse(event.body || '{}');
    if (!token || !content) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token en content zijn verplicht.' }) };
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
    if (participant.sessions.status !== 'wachten_op_vervolgvragen') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Er zijn momenteel geen openstaande vervolgvragen voor deze sessie.' }) };
    }
    const { data: existingEntry } = await supabase
      .from('entries')
      .select('id')
      .eq('session_id', participant.session_id)
      .eq('participant_id', participant.id)
      .eq('round', 2)
      .maybeSingle();
    if (existingEntry) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Je hebt de vervolgvragen al ingevuld.' }) };
    }

    await supabase.from('entries').insert({
      session_id: participant.session_id,
      participant_id: participant.id,
      round: 2,
      content,
      is_anonymous: !!isAnonymous,
    });
    const { data: allParticipants } = await supabase
      .from('participants')
      .select('id, is_organizer')
      .eq('session_id', participant.session_id);
    const sessionOrganizerParticipates = participant.sessions.organizer_participates !== false;
    const requiredIds = allParticipants
      .filter(p => !(p.is_organizer && !sessionOrganizerParticipates))
      .map(p => p.id);
    const { data: round2Entries } = await supabase
      .from('entries')
      .select('participant_id')
      .eq('session_id', participant.session_id)
      .eq('round', 2);
    const submittedIds = new Set((round2Entries || []).map(e => e.participant_id));
    const everyoneSubmitted = requiredIds.every(id => submittedIds.has(id));
    if (everyoneSubmitted) {
      // Compare-and-swap: zie submit-story.js voor de reden.
      const { data: claimedRows } = await supabase
        .from('sessions')
        .update({ status: 'document_genereren', updated_at: new Date().toISOString() })
        .eq('id', participant.session_id)
        .eq('status', 'wachten_op_vervolgvragen')
        .select('id');

      if (claimedRows && claimedRows.length > 0) {
        // BELANGRIJK: await toegevoegd, anders kan Netlify de functie afsluiten voor
        // de achtergrond-call ooit vertrekt.
        const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
        try {
          await fetch(`${siteUrl}/.netlify/functions/generate-document-background`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: participant.session_id }),
          });
        } catch (e) {
          console.error('Kon document-background niet triggeren:', e);
        }
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, everyoneSubmitted }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
