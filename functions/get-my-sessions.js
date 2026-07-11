const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  try {
    const token = event.queryStringParameters && event.queryStringParameters.token;
    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token is verplicht.' }) };
    }
    const supabase = getSupabase();
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('magic_link_token', token)
      .maybeSingle();
    if (!customer) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige of verlopen link.' }) };
    }
    if (new Date(customer.magic_link_expires) < new Date()) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Deze link is verlopen. Vraag een nieuwe op via de loginpagina.' }) };
    }
    const { data: participants } = await supabase
      .from('participants')
      .select('*, sessions(*)')
      .eq('email', customer.email)
      .order('created_at', { ascending: false });
    if (!participants || participants.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          email: customer.email,
          plan: customer.plan,
          sessions: [],
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

const { data: reflections } = await supabase
      .from('reflections')
      .select('*')
      .eq('email', customer.email)
      .order('created_at', { ascending: false });

    const sessions = participants.map(p => {
    const isDocAvailable = p.sessions.status === 'klaar' || (p.sessions.status || '').startsWith('nieuwe_ronde_');
      return {
        sessionId: p.session_id,
        category: p.sessions.category,
        status: p.sessions.status,
        plan: p.sessions.plan,
        isOrganizer: p.is_organizer,
        accessLink: `/story.html?token=${p.access_token}`,
        documentLink: isDocAvailable ? `/document.html?token=${p.access_token}` : null,
        followupUsed: (maxVersionBySession[p.session_id] || 0) >= 2,
        createdAt: p.created_at,
        updatedAt: p.sessions.updated_at,
      };
    });
  return {
      statusCode: 200,
      body: JSON.stringify({
        email: customer.email,
        plan: customer.plan,
        sessions,
        reflections: (reflections || []).map(r => ({
          id: r.id,
          token: r.access_token,
          name: r.name,
          category: r.category,
          situationSummary: r.situation_summary,
          recommendation: r.recommendation,
          status: r.status,
          createdAt: r.created_at,
        })),
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
