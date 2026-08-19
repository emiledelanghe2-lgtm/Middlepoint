const { getSupabase } = require('./_supabase');

// Mapping van Stripe price-bedragen naar je plannen (in centen, EUR)
// Pas dit aan als je prijzen ooit wijzigen in Stripe.
// Geeft null terug bij een onherkend bedrag, zodat we nooit blind een
// verkeerd plan toekennen (bv. de €2,99 zelfhulp-toevoeging, die geen
// gesprek-plan is en apart wordt afgehandeld via client_reference_id).
function mapAmountToPlan(amountInCents, isRecurring) {
  if (!isRecurring) {
    if (amountInCents === 499) return 'los';
    return null;
  }
  if (amountInCents === 499) return 'starter';
  if (amountInCents === 1299) return 'plus';
  if (amountInCents === 3499) return 'pro';
  return null;
}

function sessionsForPlan(plan) {
  const limits = { gratis: 1, los: 1, starter: 3, plus: 10, pro: 9999 };
  return limits[plan] || 1;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const Stripe = require('stripe');
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;
  try {
    const signature = event.headers['stripe-signature'];
    stripeEvent = stripe.webhooks.constructEvent(event.body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    const supabase = getSupabase();

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;

      // Bij uitgestelde betaalmethodes (bv. SEPA-overschrijving) vuurt dit
      // event al vóór het geld effectief binnen is; payment_status is dan
      // 'unpaid'. Toegang pas toekennen als de betaling echt bevestigd is.
      if (session.payment_status !== 'paid') {
        console.log(`checkout.session.completed met payment_status=${session.payment_status}, nog geen toegang toegekend.`);
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      // Betaling voor de €2,99 zelfhulp-toevoeging op een reflectie: geen
      // gesprek-plan, gewoon de bijbehorende reflectie als betaald markeren.
      const clientReferenceId = session.client_reference_id || '';
      if (clientReferenceId.startsWith('selfhelp:')) {
        const reflectionToken = clientReferenceId.slice('selfhelp:'.length);
        if (reflectionToken) {
          await supabase
            .from('reflections')
            .update({ self_help_paid: true })
            .eq('access_token', reflectionToken);
        } else {
          console.error('Zelfhulp-betaling zonder reflectie-token in client_reference_id.');
        }
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      const customerEmail = session.customer_details ? session.customer_details.email : session.customer_email;
      if (!customerEmail) {
        console.error('Geen e-mailadres gevonden in checkout session.');
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      const isRecurring = session.mode === 'subscription';
      const amountTotal = session.amount_total; // in centen
      const plan = mapAmountToPlan(amountTotal, isRecurring);
      if (!plan) {
        console.error(`Onherkend Stripe-bedrag (${amountTotal}, recurring=${isRecurring}), geen plan toegekend.`);
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
      }

      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('email', customerEmail.toLowerCase())
        .maybeSingle();

      if (existing) {
        await supabase
          .from('customers')
          .update({
            stripe_customer_id: session.customer || null,
            plan,
            plan_status: 'active',
            sessions_used_this_period: 0,
            period_start: now,
            updated_at: now,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('customers').insert({
          email: customerEmail.toLowerCase(),
          stripe_customer_id: session.customer || null,
          plan,
          plan_status: 'active',
          sessions_used_this_period: 0,
          period_start: now,
        });
      }
    }

    if (stripeEvent.type === 'customer.subscription.deleted') {
      const subscription = stripeEvent.data.object;
      const customerId = subscription.customer;
      await supabase
        .from('customers')
        .update({ plan_status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('stripe_customer_id', customerId);
    }

    if (stripeEvent.type === 'invoice.payment_succeeded') {
      // Bij een nieuwe factuurperiode (maandelijkse herfacturatie): reset het sessie-quotum
      const invoice = stripeEvent.data.object;
      const customerId = invoice.customer;
      if (invoice.billing_reason === 'subscription_cycle') {
        await supabase
          .from('customers')
          .update({
            sessions_used_this_period: 0,
            period_start: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error('Webhook processing error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
