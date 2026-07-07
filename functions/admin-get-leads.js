const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password } = JSON.parse(event.body || '{}');
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Verkeerd wachtwoord.' }) };
    }
    const supabase = getSupabase();

    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: sessions } = await supabase
      .from('sessions')
      .select('organizer_email, category, plan, status, created_at')
      .order('created_at', { ascending: false });

    const sessionsByEmail = {};
    (sessions || []).forEach(s => {
      if (!s.organizer_email) return;
      sessionsByEmail[s.organizer_email] = sessionsByEmail[s.organizer_email] || [];
      sessionsByEmail[s.organizer_email].push(s);
    });

    const leads = (customers || []).map(c => {
      const theirSessions = sessionsByEmail[c.email] || [];
      return {
        email: c.email,
        plan: c.plan || 'gratis',
        planStatus: c.plan_status || null,
        freeSessionUsed: !!c.free_session_used,
        sessionsUsedThisPeriod: c.sessions_used_this_period || 0,
        totalSessionsCreated: theirSessions.length,
        lastSessionCategory: theirSessions[0] ? theirSessions[0].category : null,
        lastSessionAt: theirSessions[0] ? theirSessions[0].created_at : null,
        stripeCustomerId: c.stripe_customer_id || null,
        createdAt: c.created_at,
      };
    });

    return { statusCode: 200, body: JSON.stringify({ leads }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
