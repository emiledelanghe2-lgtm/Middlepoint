const { getSupabase } = require('./_supabase');
const { reqLang, normLang, pre, tr } = require('./_lang');
exports.handler = async (event) => {
  const L = reqLang(event);
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) {
      return { statusCode: 401, body: JSON.stringify({ error: tr(L, 'Niet ingelogd.', 'Not logged in.') }) };
    }
    const supabase = getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData || !userData.user) {
      return { statusCode: 401, body: JSON.stringify({ error: tr(L, 'Je sessie is verlopen. Log opnieuw in.', 'Your session has expired. Please log in again.') }) };
    }
const email = userData.user.email.toLowerCase().trim();
    const name = (userData.user.user_metadata && userData.user.user_metadata.name) || email.split('@')[0];

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    const { data: reflections } = await supabase
      .from('reflections')
      .select('*')
      .eq('email', email)
      .order('created_at', { ascending: false });
    const reflectionsPayload = (reflections || []).map(r => ({
      id: r.id,
      token: r.access_token,
      name: r.name,
      category: r.category,
      situationSummary: r.situation_summary,
      recommendation: r.recommendation,
      status: r.status,
      lang: normLang(r.lang),
      selfHelpStatus: r.self_help_status,
      createdAt: r.created_at,
    }));

    const { data: participants } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('email', email)
      .order('created_at', { ascending: false });

    if (!participants || participants.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
      email,
        name,
        plan: customer ? customer.plan : 'gratis',
          sessions: [],
          reflections: reflectionsPayload,
        }),
      };
    }

    const sessionIds = participants.map(p => p.session_id);
    const { data: allDocs } = await supabase
      .from('documents')
      .select('session_id, version')
      .in('session_id', sessionIds);
    const maxVersionBySession = {};
    (allDocs || []).forEach(d => {
      maxVersionBySession[d.session_id] = Math.max(maxVersionBySession[d.session_id] || 0, d.version);
    });
    const sessions = participants.map(p => {
      const isDocAvailable = p.sessions.status === 'klaar' || (p.sessions.status || '').startsWith('nieuwe_ronde_');
      return {
        sessionId: p.session_id,
        category: p.sessions.category,
        status: p.sessions.status,
        plan: p.sessions.plan,
        isOrganizer: p.is_organizer,
        lang: normLang(p.sessions.lang),
        accessLink: `${pre(normLang(p.sessions.lang))}/story.html?token=${p.access_token}`,
        documentLink: isDocAvailable ? `${pre(normLang(p.sessions.lang))}/document.html?token=${p.access_token}` : null,
        followupUsed: (maxVersionBySession[p.session_id] || 0) >= 2,
        createdAt: p.created_at,
        updatedAt: p.sessions.updated_at,
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
  email,
        name,
        plan: customer ? customer.plan : 'gratis',
        sessions,
        reflections: reflectionsPayload,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
