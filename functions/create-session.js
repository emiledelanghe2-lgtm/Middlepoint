const { getSupabase } = require('./_supabase');

const PLAN_LIMITS = {
  gratis: 1,
  los: 1,        // eenmalig, 1 sessie totaal
  starter: 3,    // per maand
  plus: 10,      // per maand
  pro: 9999,     // onbeperkt
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const { category, organizerName, participantNames, participantEmails, organizerRole, organizerEmail, organizerSeesDocument, plan, includeFollowups } = body;
    if (!category || !organizerName || !organizerEmail || !Array.isArray(participantNames) || participantNames.length < 1) {
      return { statusCode: 400, body: JSON.stringify({ error: 'category, organizerName, organizerEmail en minstens 1 participantNames zijn verplicht.' }) };
    }

    const supabase = getSupabase();
    const normalizedEmail = organizerEmail.toLowerCase().trim();
    const sessionPlan = plan || 'gratis';

    // Check plan-limiet
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (customer) {
      const customerPlan = customer.plan || 'gratis';
      const limit = PLAN_LIMITS[customerPlan] ?? 1;
      const used = customer.sessions_used_this_period || 0;

      // Check of periode nog geldig is (enkel voor abonnementen, niet voor gratis/los)
      const now = new Date();
      const periodEnd = customer.period_end ? new Date(customer.period_end) : null;
      const periodStillValid = periodEnd ? now < periodEnd : true;

      // Gratis: check of al gebruikt
      if (customerPlan === 'gratis' && customer.free_session_used) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: 'Je hebt de gratis proefversie al gebruikt. Kies een betaald plan om verder te gaan.',
            limitReached: true,
          }),
        };
      }

      // Los (eenmalig): check of al gebruikt
      if (customerPlan === 'los' && used >= limit) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: 'Je hebt je eenmalige gesprek al gebruikt. Kies een abonnement voor meer gesprekken.',
            limitReached: true,
          }),
        };
      }

      // Abonnementen (starter, plus, pro): check enkel als periode nog geldig is
      if (!['gratis', 'los'].includes(customerPlan) && periodStillValid && used >= limit) {
        const planLabels = { starter: 'Starter', plus: 'Plus', pro: 'Pro' };
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: `Je hebt je limiet bereikt voor het ${planLabels[customerPlan] || customerPlan}-plan (${limit} gesprekken per maand). Je limiet wordt volgende maand opnieuw ingesteld.`,
            limitReached: true,
          }),
        };
      }
    }

    const emails = Array.isArray(participantEmails) ? participantEmails : [];

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        category,
        organizer_role: organizerRole || null,
        organizer_email: normalizedEmail,
        organizer_sees_document: organizerSeesDocument !== false,
        plan: sessionPlan,
        include_followups: includeFollowups !== false,
      })
      .select()
      .single();
    if (sessionError) throw sessionError;

    const isOrganizerAlsoParticipant = !organizerRole;
    let participantsToInsert;
    if (isOrganizerAlsoParticipant) {
      participantsToInsert = [organizerName, ...participantNames].map((name, i) => ({
        session_id: session.id,
        display_name: name,
        is_organizer: i === 0,
        email: i === 0 ? normalizedEmail : (emails[i - 1] || null),
      }));
    } else {
      participantsToInsert = participantNames.map((name, i) => ({
        session_id: session.id,
        display_name: name,
        is_organizer: false,
        email: emails[i] || null,
      }));
      participantsToInsert.push({
        session_id: session.id,
        display_name: organizerName,
        is_organizer: true,
        email: normalizedEmail,
      });
    }

    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .insert(participantsToInsert)
      .select();
    if (participantsError) throw participantsError;

    // Sessie-teller bijwerken
    const now = new Date();
    if (customer) {
      const updates = {
        sessions_used_this_period: (customer.sessions_used_this_period || 0) + 1,
        updated_at: now.toISOString(),
      };
      if (sessionPlan === 'gratis') updates.free_session_used = true;
      await supabase.from('customers').update(updates).eq('email', normalizedEmail);
    } else {
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await supabase.from('customers').insert({
        email: normalizedEmail,
        plan: sessionPlan,
        sessions_used_this_period: 1,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        free_session_used: sessionPlan === 'gratis',
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId: session.id,
        participants: participants.map(p => ({
          id: p.id,
          name: p.display_name,
          isOrganizer: p.is_organizer,
          accessLink: `/story.html?token=${p.access_token}`,
        })),
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
