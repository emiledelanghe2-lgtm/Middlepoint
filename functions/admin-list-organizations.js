const { getSupabase } = require('./_supabase');
const { checkAdminAuth } = require('./_admin-auth');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password } = JSON.parse(event.body || '{}');
    const authCheck = await checkAdminAuth(event, password);
    if (!authCheck.ok) {
      return { statusCode: authCheck.statusCode, body: JSON.stringify({ error: authCheck.error }) };
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
