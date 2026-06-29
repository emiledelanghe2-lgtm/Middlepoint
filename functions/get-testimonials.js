const { getSupabase } = require('./_supabase');
exports.handler = async () => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('testimonials')
      .select('display_name, is_anonymous, content, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ testimonials: data || [] }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
