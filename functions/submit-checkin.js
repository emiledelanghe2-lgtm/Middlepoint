const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, content, isAnonymous } = JSON.parse(event.body || '{}');
    const supabase = getSupabase();
    const { data: participant } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }
    const match = (participant.sessions.status || '').match(/^nieuwe_ronde_(\d+)$/);
    if (!match) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Er is momenteel geen open check-in ronde voor deze sessie.' }) };
    }
    const round = parseInt(match[1], 10);
    await supabase.from('entries').insert({
      session_id: participant.session_id,
      participant_id: participant.id,
      round,
      content,
      is_anonymous: !!isAnonymous,
    });
    const { data: allParticipants } = await supabase
      .from('participants')
      .select('id, is_organizer')
      .eq('session_id', participant.session_id);
    const sessionOrganizerRole = participant.sessions.organizer_role;
    const requiredIds = allParticipants
      .filter(p => !(p.is_organizer && sessionOrganizerRole))
      .map(p => p.id);
    const { data: roundEntries } = await supabase
      .from('entries')
      .select('participant_id')
      .eq('session_id', participant.session_id)
      .eq('round', round);
    const submittedIds = new Set((roundEntries || []).map(e => e.participant_id));
    const everyoneSubmitted = requiredIds.every(id => submittedIds.has(id));
    if (everyoneSubmitted) {
      await supabase
        .from('sessions')
        .update({ status: 'document_genereren', updated_at: new Date().toISOString() })
        .eq('id', participant.session_id);
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
    return { statusCode: 200, body: JSON.stringify({ ok: true, everyoneSubmitted }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
