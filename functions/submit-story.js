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

    const { data: participant, error: pError } = await supabase
      .from('participants')
      .select('*')
      .eq('access_token', token)
      .single();

    if (pError || !participant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige link.' }) };
    }

    if (participant.is_organizer) {
      return { statusCode: 400, body: JSON.stringify({ error: 'De organisator vult zelf geen verhaal in.' }) };
    }

    await supabase.from('entries').insert({
      session_id: participant.session_id,
      participant_id: participant.id,
      round: 1,
      content,
      is_anonymous: !!isAnonymous,
    });

    const { data: allParticipants } = await supabase
      .from('participants')
      .select('id, is_organizer')
      .eq('session_id', participant.session_id);

    const requiredIds = allParticipants.filter(p => !p.is_organizer).map(p => p.id);

    const { data: round1Entries } = await supabase
      .from('entries')
      .select('participant_id')
      .eq('session_id', participant.session_id)
      .eq('round', 1);

    const submittedIds = new Set((round1Entries || []).map(e => e.participant_id));
    const everyoneSubmitted = requiredIds.every(id => submittedIds.has(id));

    if (everyoneSubmitted) {
      await supabase
        .from('sessions')
        .update({ status: 'verhalen_klaar_vervolgvragen_genereren', updated_at: new Date().toISOString() })
        .eq('id', participant.session_id);

      const siteUrl = process.env.URL || process.env.DEPLOY_URL || '';
      fetch(`${siteUrl}/.netlify/functions/generate-followups-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: participant.session_id }),
      }).catch(e => console.error('Kon followups-background niet triggeren:', e));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, everyoneSubmitted }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
