const { getSupabase } = require('./_supabase');

async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API fout (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.content.map(b => b.text || '').join('\n');
}

exports.handler = async (event) => {
  try {
    const { sessionId } = JSON.parse(event.body || '{}');
    const supabase = getSupabase();

    const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
    const { data: participants } = await supabase
      .from('participants')
      .select('id, display_name, is_organizer')
      .eq('session_id', sessionId);

    const realParticipants = participants.filter(p => !p.is_organizer);

    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('session_id', sessionId)
      .eq('round', 1);

    const storiesText = realParticipants
      .map(p => {
        const entry = entries.find(e => e.participant_id === p.id);
        return `### Verhaal van ${p.display_name}:\n${entry ? entry.content : '(geen verhaal)'}`;
      })
      .join('\n\n');

    const systemPrompt = `Je bent een neutrale, empathische conflictbemiddelaar. Je leest het verhaal van meerdere mensen over hetzelfde conflict (categorie: ${session.category}). Je taak: per persoon 2-4 scherpe, niet-beschuldigende vervolgvragen formuleren die helpen om dieper te graven naar de werkelijke kern van het probleem -- vaak is wat iemand eerst vertelt slechts het topje van de ijsberg. Gebruik vooral tegenstellingen, onduidelijkheden, of dingen die in het verhaal van de ANDERE persoon staan maar niet in dat van deze persoon, om gerichte vragen te stellen. Toon: warm, nieuwsgierig, niet rechterlijk. Antwoord ALLEEN met geldige JSON, geen andere tekst, in dit formaat: {"vragen_per_persoon": [{"naam": "...", "vragen": ["...", "..."]}]}`;

    const userPrompt = `Hier zijn de verhalen:\n\n${storiesText}\n\nGeef per persoon hun vervolgvragen.`;

    const aiResponse = await callClaude(systemPrompt, userPrompt);
    const cleaned = aiResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    for (const item of parsed.vragen_per_persoon) {
      const participant = realParticipants.find(p => p.display_name === item.naam);
      if (!participant) continue;
      await supabase.from('followup_questions').insert({
        session_id: sessionId,
        participant_id: participant.id,
        questions: item.vragen,
      });
    }

    await supabase
      .from('sessions')
      .update({ status: 'wachten_op_vervolgvragen', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
