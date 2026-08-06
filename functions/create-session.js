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
      proExtraQuestions,
      organizationId,
    } = body;

    if (!category || !organizerName || !organizerEmail || !Array.isArray(participantNames) || participantNames.length < 1) {
      return { statusCode: 400, body: JSON.stringify({ error: 'category, organizerName, organizerEmail en minstens 1 participantNames zijn verplicht.' }) };
    }

    const participates = organizerParticipates !== false;

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

    // Bedrijfsgesprek: gedeelde pot van de organisatie, geen individuele klant-logica.
    let organization = null;
    if (organizationId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .maybeSingle();
      if (!org) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Ongeldige organisatie.' }) };
      }
      const used = org.sessions_used_this_period || 0;
      if (used >= (org.session_limit || 0)) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: `Jullie hebben de limiet van ${org.session_limit} gesprekken voor ${org.name} bereikt voor deze periode.`,
            limitReached: true,
          }),
        };
      }
      organization = org;
    }

    // Enkel de individuele klant-logica toepassen als dit GEEN bedrijfsgesprek is.
    let customer = null;
    if (!organization) {
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();
      customer = existingCustomer;

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
        pro_extra_questions: proExtraQuestions || [],
        organization_id: organizationId || null,
      })
      .select()
      .single();
    if (sessionError) throw sessionError;

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
    if (organization) {
      await supabase.from('organizations').update({
        sessions_used_this_period: (organization.sessions_used_this_period || 0) + 1,
        updated_at: now.toISOString(),
      }).eq('id', organization.id);
    } else if (customer) {
      const samesPlan = customer.plan === sessionPlan;
      const updates = {
        plan: sessionPlan,
        plan_status: 'active',
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
        plan_status: 'active',
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
