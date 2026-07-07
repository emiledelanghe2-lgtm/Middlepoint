const { getSupabase } = require('./_supabase');

const PLAN_LIMITS = {
  gratis: 1,
  los: 1,
  starter: 3,
  plus: 10,
  pro: 9999,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      category,
      organizerName,
      participantNames,
      participantEmails,
      organizerRole,
      organizerEmail,
      organizerSeesDocument,
      organizerParticipates,
      participantsReceiveDocument,
      plan,
      includeFollowups,
    } = body;

    if (!category || !organizerName || !organizerEmail || !Array.isArray(participantNames) || participantNames.length < 1) {
      return { statusCode: 400, body: JSON.stringify({ error: 'category, organizerName, organizerEmail en minstens 1 participantNames zijn verplicht.' }) };
    }

    // organizerParticipates: standaard true (organisator doet zelf mee).
    // Enkel false als de frontend dit expliciet meegeeft (derde persoon, bv. therapeut/HR).
    const participates = organizerParticipates !== false;

    // Minstens 2 echte deelnemers die de vragenlijst zelf invullen:
    // - doet de organisator zelf mee: organisator + minstens 1 naam in participantNames
    // - doet de organisator niet mee (derde partij): minstens 2 namen in participantNames
    const minParticipantNames = participates ? 1 : 2;
    if (participantNames.length < minParticipantNames) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: participates
            ? 'Er is minstens 1 andere deelnemer naast jezelf nodig.'
            : 'Als derde persoon (je doet zelf niet mee) zijn er minstens 2 deelnemers nodig voor een gesprek.',
        }),
      };
    }

    const emails = Array.isArray(participantEmails) ? participantEmails : [];

    // E-mailadres is verplicht voor elke echte deelnemer die de vragenlijst invult.
    const missingEmailIndex = participantNames.findIndex((_, i) => !emails[i] || !emails[i].trim());
    if (missingEmailIndex !== -1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `E-mailadres ontbreekt voor deelnemer "${participantNames[missingEmailIndex]}". Een e-mailadres is verplicht voor elke deelnemer.` }),
      };
    }

    const supabase = getSupabase();
    const normalizedEmail = organizerEmail.toLowerCase().trim();
    const sessionPlan = plan || 'gratis';

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (customer) {
      const customerPlan = customer.plan || 'gratis';
      const used = customer.sessions_used_this_period || 0;
      const now = new Date();
      const periodEnd = customer.period_end ? new Date(customer.period_end) : null;
      const periodStillValid = periodEnd ? now < periodEnd : true;

      if (sessionPlan === 'gratis' && customer.free_session_used) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: 'Je hebt de gratis proefversie al gebruikt. Kies een betaald plan om verder te gaan.',
            limitReached: true,
          }),
        };
      }

      if (['starter', 'plus', 'pro'].includes(customerPlan) && periodStillValid) {
        const limit = PLAN_LIMITS[customerPlan] ?? 3;
        if (used >= limit) {
          const planLabels = { starter: 'Starter', plus: 'Plus', pro: 'Pro' };
          return {
            statusCode: 403,
            body: JSON.stringify({
              error: `Je hebt je limiet bereikt voor het ${planLabels[customerPlan] || customerPlan}-plan (${limit} gesprekken per maand). Je limiet wordt volgende maand automatisch opnieuw ingesteld.`,
              limitReached: true,
            }),
          };
        }
      }
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        category,
        organizer_role: organizerRole || null,
        organizer_email: normalizedEmail,
        organizer_sees_document: organizerSeesDocument !== false,
        organizer_participates: participates,
        participants_receive_document: participates ? true : (participantsReceiveDocument !== false),
        plan: sessionPlan,
        include_followups: includeFollowups !== false,
      })
      .select()
      .single();
    if (sessionError) throw sessionError;

    // De organisator krijgt altijd een eigen participants-rij en toegangslink, ook als
    // hij zelf niet meedoet: die link geeft dan enkel toegang om het document te bekijken,
    // niet om de vragenlijst in te vullen (dat wordt elders, in story.html, afgehandeld
    // op basis van sessions.organizer_participates).
    let participantsToInsert;
    if (participates) {
      participantsToInsert = [organizerName, ...participantNames].map((name, i) => ({
        session_id: session.id,
        display_name: name,
        is_organizer: i === 0,
        email: i === 0 ? normalizedEmail : emails[i - 1].toLowerCase().trim(),
      }));
    } else {
      participantsToInsert = participantNames.map((name, i) => ({
        session_id: session.id,
        display_name: name,
        is_organizer: false,
        email: emails[i].toLowerCase().trim(),
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

    const now = new Date();
    if (customer) {
      const samesPlan = customer.plan === sessionPlan;
      const updates = {
        plan: sessionPlan,
        sessions_used_this_period: sessionPlan === 'los' ? 1 : (samesPlan ? (customer.sessions_used_this_period || 0) + 1 : 1),
        updated_at: now.toISOString(),
      };
      if (sessionPlan === 'gratis') updates.free_session_used = true;
      if (!samesPlan) {
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        updates.period_start = now.toISOString();
        updates.period_end = periodEnd.toISOString();
      }
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
        organizerParticipates: participates,
        participantsReceiveDocument: participates ? true : (participantsReceiveDocument !== false),
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
