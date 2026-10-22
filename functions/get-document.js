const { getSupabase } = require('./_supabase');
const { reqLang, tr } = require('./_lang');

exports.handler = async (event) => {
  const token = event.queryStringParameters && event.queryStringParameters.token;
  const L = reqLang(event);
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ error: tr(L, 'token ontbreekt.', 'token is missing.') }) };
  }
  try {
    const supabase = getSupabase();
    const { data: participant } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('access_token', token)
      .single();
    if (!participant) {
      return { statusCode: 404, body: JSON.stringify({ error: tr(L, 'Ongeldige link.', 'Invalid link.') }) };
    }

    const session = participant.sessions;
    const isThirdPartyOrganizer = participant.is_organizer && session.organizer_participates === false;

    if (participant.is_organizer && !session.organizer_sees_document) {
      return { statusCode: 403, body: JSON.stringify({ error: tr(L, 'De organisator heeft geen toegang tot dit document.', 'The organizer does not have access to this document.') }) };
    }

    if (!participant.is_organizer && session.organizer_participates === false && session.participants_receive_document === false) {
      return { statusCode: 403, body: JSON.stringify({ error: tr(L, 'Dit document is enkel zichtbaar voor de organisator van dit gesprek.', 'This document is only visible to the organizer of this conversation.') }) };
    }

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('session_id', participant.session_id)
      .order('version', { ascending: false });

    const { data: allParticipants } = await supabase
      .from('participants')
      .select('display_name, email')
      .eq('session_id', participant.session_id);
    const missingEmailNames = (allParticipants || [])
      .filter(p => !p.email)
      .map(p => p.display_name);

const plan = session.plan || 'gratis';
    const isPaid = plan !== 'gratis';
    const showAdvisorInsight = plan === 'pro' && participant.is_organizer;
    const safeDocuments = (documents || []).map(doc =>
      showAdvisorInsight ? doc : { ...doc, advisor_insight: null }
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        myName: participant.display_name,
        isThirdPartyViewer: isThirdPartyOrganizer,
        sessionStatus: session.status,
        lang: session.lang || 'nl',
        category: session.category,
        isPaid,
        plan,
        showAdvisorInsight,
        missingEmailNames,
documents: safeDocuments,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
