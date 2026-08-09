const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password, organizationId, emails } = JSON.parse(event.body || '{}');
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Verkeerd wachtwoord.' }) };
    }
    if (!organizationId || !Array.isArray(emails) || emails.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'organizationId en minstens 1 e-mailadres zijn verplicht.' }) };
    }
    const supabase = getSupabase();

    const { data: organization } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .maybeSingle();
    if (!organization) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Bedrijf niet gevonden.' }) };
    }

    const normalizedEmails = [...new Set(
      emails.map(e => (e || '').toLowerCase().trim()).filter(e => e && e.includes('@'))
    )];

    const added = [];
    const alreadyInThisOrg = [];
    const belongsElsewhere = [];

    for (const email of normalizedEmails) {
      const { data: existing } = await supabase
        .from('organization_members')
        .select('*, organizations(name)')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        if (existing.organization_id === organizationId) {
          alreadyInThisOrg.push(email);
        } else {
          belongsElsewhere.push({ email, orgName: existing.organizations ? existing.organizations.name : 'onbekend' });
        }
        continue;
      }

      const { error } = await supabase
        .from('organization_members')
        .insert({ organization_id: organizationId, email });
      if (error) throw error;
      added.push(email);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ added, alreadyInThisOrg, belongsElsewhere }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
