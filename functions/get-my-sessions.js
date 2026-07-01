const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  try {
    const token = event.queryStringParameters && event.queryStringParameters.token;
    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ error: 'token is verplicht.' }) };
    }

    const supabase = getSupabase();

    // Zoek de customer op basis van de magic link token
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('magic_link_token', token)
      .maybeSingle();

    if (!customer) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Ongeldige of verlopen link.' }) };
    }

    // Check of de token nog geldig is (max 24u)
    if (new Date(customer.magic_link_expires) < new Date()) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Deze link is verlopen. Vraag een nieuwe op via de loginpagina.' }) };
    }

    // Haal alle sessies/gesprekken op voor dit e-mailadres
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

    const sessions = participants.map(p => ({
      sessionId: p.session_id,
      category: p.sessions.category,
      status: p.sessions.status,
      isOrganizer: p.is_organizer,
      accessLink: `/story.html?token=${p.access_token}`,
      documentLink: p.sessions.status === 'klaar' ? `/document.html?token=${p.access_token}` : null,
      createdAt: p.created_at,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        email: customer.email,
        plan: customer.plan,
        sessions,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
