const crypto = require('crypto');
const { getSupabase } = require('./_supabase');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a == null ? '' : a));
  const bufB = Buffer.from(String(b == null ? '' : b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function getClientIp(event) {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip']
    || h['client-ip']
    || (h['x-forwarded-for'] || '').split(',')[0].trim()
    || 'unknown';
}

async function checkAdminAuth(event, password) {
  if (!process.env.ADMIN_PASSWORD) {
    return { ok: false, statusCode: 401, error: 'Verkeerd wachtwoord.' };
  }
  const supabase = getSupabase();
  const ip = getClientIp(event);
  const now = new Date();

  const { data: attempt } = await supabase
    .from('admin_login_attempts')
    .select('*')
    .eq('ip', ip)
    .maybeSingle();

  if (attempt && attempt.locked_until && new Date(attempt.locked_until) > now) {
    return { ok: false, statusCode: 429, error: 'Te veel mislukte pogingen. Probeer het over enkele minuten opnieuw.' };
  }

  if (!timingSafeEqual(password, process.env.ADMIN_PASSWORD)) {
    const failedCount = (attempt ? attempt.failed_count : 0) + 1;
    const lockedUntil = failedCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : null;
    await supabase.from('admin_login_attempts').upsert({
      ip,
      failed_count: lockedUntil ? 0 : failedCount,
      locked_until: lockedUntil,
      updated_at: now.toISOString(),
    });
    return { ok: false, statusCode: 401, error: 'Verkeerd wachtwoord.' };
  }

  if (attempt) {
    await supabase.from('admin_login_attempts').delete().eq('ip', ip);
  }
  return { ok: true };
}

module.exports = { checkAdminAuth };
