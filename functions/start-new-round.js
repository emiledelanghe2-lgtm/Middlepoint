const { getSupabase } = require('./_supabase');
const { normLang, reqLang, tr } = require('./_lang');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, lang } = JSON.parse(event.body || '{}');
    let L = reqLang(event, lang);
    const supabase = getSupabase();
    const { data: participant } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: tr(L, 'Ongeldige link.', 'Invalid link.') }) };
    }
    L = normLang(participant.sessions.lang);

    const status = participant.sessions.status || '';

    // BUGFIX: als de opvolgronde al bezig is (gestart door de andere persoon),
    // moet deze persoon gewoon kunnen instappen, niet geblokkeerd worden.
    const activeRoundMatch = status.match(/^nieuwe_ronde_(\d+)$/);
    if (activeRoundMatch) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, round: parseInt(activeRoundMatch[1], 10) }) };
    }

    if (status !== 'klaar') {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'Dit document is nog niet afgerond, dus nog geen nieuwe ronde mogelijk.', 'This document is not finished yet, so a new round is not possible yet.') }) };
    }

    // Elk gesprek geeft recht op precies één opvolging. Check of die al
    // volledig werd afgerond (dus of er al een tweede documentversie bestaat).
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('version')
      .eq('session_id', participant.session_id)
      .order('version', { ascending: false })
      .limit(1);
    if (existingDocs && existingDocs.length && existingDocs[0].version >= 2) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: tr(L, 'Je hebt de opvolging voor dit gesprek al gebruikt. Elk gesprek geeft recht op één opvolgdocument. Start gerust een nieuw gesprek als er meer te bespreken is.', 'You have already used the follow-up for this conversation. Every conversation includes one follow-up document. Feel free to start a new conversation if there is more to discuss.') }),
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
