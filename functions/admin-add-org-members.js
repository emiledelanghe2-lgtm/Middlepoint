const { getSupabase } = require('./_supabase');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { password, organizationId, email } = JSON.parse(event.body || '{}');
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Verkeerd wachtwoord.' }) };
    }
    if (!organizationId || !email || !email.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'organizationId en email zijn verplicht.' }) };
    }
    const normalizedEmail = email.toLowerCase().trim();
    const supabase = getSupabase();

    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .maybeSingle();
    if (!organization) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Bedrijf niet gevonden.' }) };
    }

    const { data: existing } = await supabase
      .from('organization_members')
      .select('*, organizations(name)')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existing) {
      const belongsToThisOrg = existing.organization_id === organizationId;
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: belongsToThisOrg
            ? `${normalizedEmail} staat al bij dit bedrijf.`
            : `${normalizedEmail} hoort al bij een ander bedrijf (${existing.organizations ? existing.organizations.name : 'onbekend'}). Verwijder het adres daar eerst.`,
        }),
      };
    }

    const { data: member, error } = await supabase
      .from('organization_members')
      .insert({ organization_id: organizationId, email: normalizedEmail })
      .select()
      .single();
    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ member }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
