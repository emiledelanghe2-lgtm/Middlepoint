const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token } = JSON.parse(event.body || '{}');
    const supabase = getSupabase();
    const { data: participant } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }
    if (participant.sessions.status !== 'klaar') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Dit document is nog niet afgerond, dus nog geen nieuwe ronde mogelijk.' }) };
    }

    // NIEUW: elk gesprek geeft recht op precies één opvolging, nooit meer.
    // We checken of er al ooit een opvolgronde (round 3 of hoger) is gestart
    // voor deze sessie, ongeacht of die volledig werd afgerond.
    const { data: allEntries } = await supabase
      .from('entries')
      .select('round')
      .eq('session_id', participant.session_id);
    const alreadyUsedFollowup = (allEntries || []).some(e => e.round >= 3);
    if (alreadyUsedFollowup) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Je hebt de opvolging voor dit gesprek al gebruikt. Elk gesprek geeft recht op één opvolgdocument.' }),
      };
    }

    const { data: entries } = await supabase
      .from('entries')
      .select('round')
      .eq('session_id', participant.session_id)
      .order('round', { ascending: false })
      .limit(1);
    const nextRound = entries && entries.length ? entries[0].round + 1 : 3;
    await supabase
      .from('sessions')
      .update({ status: `nieuwe_ronde_${nextRound}`, updated_at: new Date().toISOString() })
      .eq('id', participant.session_id);
    return { statusCode: 200, body: JSON.stringify({ ok: true, round: nextRound }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
