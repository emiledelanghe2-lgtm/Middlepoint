const { getSupabase } = require('./_supabase');

async function callClaude(systemPrompt, userPrompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 2000,
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

// Strenge maar terughoudende veiligheidscheck: enkel reageren op ONDUBBELZINNIGE, acute
// ernst. Gewone conflicten (een klap, verwijten, ontrouw, ruzie) zijn GEEN reden om te
// stoppen -- dat is precies waar dit product wel bij moet helpen. Bij twijfel: niet stoppen.
async function checkSafety(storiesText) {
  const systemPrompt = `Je bent een strenge maar terughoudende veiligheidsfilter voor een conflictbemiddelings-app. Je leest verhalen van mensen over een conflict. Je taak: enkel signaleren bij ONDUBBELZINNIGE, ACUTE ernst -- niet bij gewone relationele/fysieke conflicten.

STOP enkel bij: actieve suïcidale gedachten of plannen, kindermisbruik, seksueel geweld/verkrachting, een poging tot doodslag/moord, of beschrijvingen van acuut, ernstig fysiek gevaar voor het leven.

STOP NIET bij: gewone ruzies, één klap of duw zonder verdere escalatie, verwijten over wie wat deed, emotionele pijn, jaloezie, ontrouw, financiële conflicten, opvoedingsconflicten, of vage uitspraken zonder concrete ernst. Twijfel je, kies dan voor NIET stoppen.

Antwoord ALLEEN met geldige JSON: {"stop": true/false, "categorie": "suicide|geweld|misbruik|geen", "korte_reden": "..."}`;

  const response = await callClaude(systemPrompt, storiesText, 300);
  const cleaned = response.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { stop: false, categorie: 'geen', korte_reden: '' };
  }
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

    const realParticipants = participants.filter(p => !(p.is_organizer && session.organizer_role));

    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('session_id', sessionId)
      .eq('round', 1);

    // Bouw een overzicht van alle verhalen, met naam, voor de AI
    const storiesText = realParticipants
      .map(p => {
        const entry = entries.find(e => e.participant_id === p.id);
        return `### Verhaal van ${p.display_name}:\n${entry ? entry.content : '(geen verhaal)'}`;
      })
      .join('\n\n');

    // Veiligheidscheck eerst -- enkel stoppen bij ondubbelzinnige, acute ernst
    const safety = await
