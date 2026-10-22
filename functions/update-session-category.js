const { getSupabase } = require('./_supabase');
const { normLang, reqLang, tr } = require('./_lang');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { token, category, lang } = JSON.parse(event.body || '{}');
    let L = reqLang(event, lang);
    if (!token || !category) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'token en category zijn verplicht.', 'token and category are required.') }) };
    }
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
    // Enkel aanpasbaar zolang het document nog niet gegenereerd wordt
    const status = participant.sessions.status || '';
    const locked = status === 'document_genereren' || status === 'klaar' || status.startsWith('nieuwe_ronde_');
    if (locked) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'De categorie kan niet meer aangepast worden op dit moment.', 'The category can no longer be changed at this moment.') }) };
    }
    // NIEUW: ook blokkeren zodra een ANDERE deelnemer al zijn antwoorden indiende,
    // ook al staat de sessiestatus zelf nog op 'wachten_op_verhalen'. Anders zou
    // iemand de categorie nog kunnen wijzigen nadat de ander al onder de oude
    // categorie antwoordde, wat tegenstrijdige input in het document zou geven.
    const { data: otherEntries } = await supabase
      .from('entries')
      .select('id')
      .eq('session_id', participant.session_id)
      .eq('round', 1)
      .neq('participant_id', participant.id)
      .limit(1);
    if (otherEntries && otherEntries.length > 0) {
      return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'De andere deelnemer heeft al ingediend, de categorie kan nu niet meer aangepast worden.', 'The other participant has already submitted, the category can no longer be changed.') }) };
    }
    await supabase
      .from('sessions')
      .update({ category, updated_at: new Date().toISOString() })
      .eq('id', participant.session_id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
