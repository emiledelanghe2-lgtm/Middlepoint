const { getSupabase } = require('./_supabase');

exports.handler = async (event) => {
  const email = event.queryStringParameters && event.queryStringParameters.email;
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email is verplicht.' }) };
  }
  try {
    const supabase = getSupabase();
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (!customer) {
      return { statusCode: 200, body: JSON.stringify({ known: false }) };
    }

    const ACTIVE_SUBSCRIPTION_PLANS = ['starter', 'plus', 'pro'];
    const hasActiveSubscription =
      ACTIVE_SUBSCRIPTION_PLANS.includes(customer.plan) &&
      customer.plan_status === 'active';

    // Voor gratis/los, of onbekende/niet-actieve abonnementen: doe alsof
    // het e-mailadres onbekend is. new.html verandert daar toch niets aan
    // het gekozen plan bij, dus dit heeft geen effect op het gedrag —
    // maar het voorkomt dat iemand met een willekeurig e-mailadres kan
    // opvragen of dat adres klant is en wat zijn/haar status is.
    if (!hasActiveSubscription) {
      return { statusCode: 200, body: JSON.stringify({ known: false }) };
    }

    const PLAN_LIMITS = { gratis: 1, los: 1, starter: 3, plus: 10, pro: 30 };
    const limit = PLAN_LIMITS[customer.plan] ?? 1;
    const used = customer.sessions_used_this_period || 0;
    const remaining = Math.max(0, limit - used);
    const planLabels = {
      gratis: 'Gratis',
      los: 'Eén gesprek',
      starter: 'Starter',
      plus: 'Plus',
      pro: 'Pro',
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        known: true,
        plan: customer.plan,
        planLabel: planLabels[customer.plan] || customer.plan,
        planStatus: customer.plan_status,
        sessionsUsed: used,
        sessionsLimit: limit,
        sessionsRemaining: remaining,
        periodEnd: customer.period_end,
        freeSessionUsed: customer.free_session_used,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
