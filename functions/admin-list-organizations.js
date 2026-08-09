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
    const { data: organizations } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });
    const { data: members } = await supabase
      .from('organization_members')
      .select('*')
      .order('created_at', { ascending: true });
    const membersByOrg = {};
    (members || []).forEach(m => {
      membersByOrg[m.organization_id] = membersByOrg[m.organization_id] || [];
      membersByOrg[m.organization_id].push({ id: m.id, email: m.email });
    });
    const result = (organizations || []).map(o => ({
      id: o.id,
      name: o.name,
      sessionLimit: o.session_limit,
      sessionsUsedThisPeriod: o.sessions_used_this_period,
      periodEnd: o.period_end,
      createdAt: o.created_at,
      members: membersByOrg[o.id] || [],
    }));
    return { statusCode: 200, body: JSON.stringify({ organizations: result }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
