const { createClient } = require('@supabase/supabase-js');

// Service role key wordt gebruikt server-side (in Netlify Functions), nooit in de browser.
// Dit geeft volledige toegang aan onze eigen backend-logica, terwijl de browser
// nooit rechtstreeks met de database praat.
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in de environment variables.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = { getSupabase };
