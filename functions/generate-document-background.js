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
      max_tokens: 4000,
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
      .order('round', { ascending: true });

    const fullText = realParticipants
      .map(p => {
        const myEntries = entries.filter(e => e.participant_id === p.id);
        const naam = p.display_name;
        return myEntries
          .map(e => {
            const label = e.round === 1
              ? 'Oorspronkelijk verhaal'
              : e.round === 2
                ? 'Antwoorden op vervolgvragen'
                : `Check-in aanvulling (ronde ${e.round})`;
            const anonTag = e.is_anonymous ? ' (deze persoon wil hier anoniem blijven -- vermeld nooit de naam bij dit specifieke punt in het document)' : '';
            return `### ${naam} -- ${label}${anonTag}:\n${e.content}`;
          })
          .join('\n\n');
      })
      .join('\n\n---\n\n');

    const participantNames = realParticipants.map(p => p.display_name).join(' en ');

    const systemPrompt = `Je bent een volledig neutrale, warme conflictbemiddelaar die een gestructureerd rapport schrijft voor een conflict in de categorie "${session.category}". Je bent NOOIT partijdig: je geeft geen van beide partijen "gelijk", je benoemt feiten en gevoelens van beide kanten evenwichtig. Je toon is menselijk, geen kil juridisch rapport, maar ook niet zweverig.

Bouw het rapport met exact deze onderdelen:
1. shared_summary: een objectieve samenvatting van het conflict, gecombineerd uit beide verhalen, in neutrale taal.
2. common_ground: wat beide partijen gemeenschappelijk hebben of waar ze het al over eens zijn -- dit komt altijd EERST getoond worden voor de verschillen, om de-escalatie te bevorderen.
3. perspectives: per persoon, een uitleg van het standpunt van de ANDERE persoon, herschreven in toegankelijke taal specifiek gericht aan deze persoon ("Wat [naam van de ander] vooral voelt/bedoelt is..."), plus wat die ander persoon goed doet en waar die ander persoon kan groeien.
4. tips: per persoon, concrete, niet-beschuldigende tips wat ZIJZELF beter kunnen doen.
5. questions_to_ask: per persoon, 2-4 concrete vragen die ze aan de ander kunnen stellen om beter te begrijpen en het gesprek te openen.
6. suggested_phrases: per persoon, 1-3 concrete zinnen die ze zouden kunnen zeggen om het conflict te helpen oplossen.

Antwoord ALLEEN met geldige JSON, geen andere tekst, in dit exacte formaat:
{
  "shared_summary": "...",
  "common_ground": "...",
  "perspectives": { "Naam1": { "explanation": "...", "strengths": "...", "growth_areas": "..." }, "Naam2": {...} },
  "tips": { "Naam1": ["...", "..."], "Naam2": [...] },
  "questions_to_ask": { "Naam1": ["...", "..."], "Naam2": [...] },
  "suggested_phrases": { "Naam1": ["...", "..."], "Naam2": [...] }
}`;

    const userPrompt = `Conflict tussen: ${participantNames}\n\n${fullText}\n\nGeef het volledige rapport in het gevraagde JSON-formaat, in het Nederlands.`;

    const aiResponse = await callClaude(systemPrompt, userPrompt);
    const cleaned = aiResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const { data: existingDocs } = await supabase
      .from('documents')
      .select('version')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = existingDocs && existingDocs.length ? existingDocs[0].version + 1 : 1;

    await supabase.from('documents').insert({
      session_id: sessionId,
      version: nextVersion,
      shared_summary: parsed.shared_summary,
      common_ground: parsed.common_ground,
      perspectives: parsed.perspectives,
      tips: parsed.tips,
      questions_to_ask: parsed.questions_to_ask,
      suggested_phrases: parsed.suggested_phrases,
    });

    await supabase
      .from('sessions')
      .update({ status: 'klaar', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
