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
      max_tokens: maxTokens || 2500,
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

async function checkSafety(text) {
  const systemPrompt = `Je bent een strenge maar terughoudende veiligheidsfilter voor een reflectie-app. Je leest de tekst van iemand die worstelt met een situatie met iemand anders. Je taak: enkel signaleren bij ondubbelzinnige, acute ernst.

Stop enkel bij: actieve suicidale gedachten of plannen, kindermisbruik, seksueel geweld of verkrachting, een poging tot doodslag of moord, of beschrijvingen van acuut, ernstig fysiek gevaar voor het leven.

Stop niet bij: gewone spanningen, jaloezie, ontrouw, verdriet, onzekerheid, of vage uitspraken zonder concrete ernst. Twijfel je, kies dan voor niet stoppen.

Antwoord alleen met geldige JSON: {"stop": true/false, "categorie": "suicide|geweld|misbruik|geen", "korte_reden": "..."}`;

  const response = await callClaude(systemPrompt, text, 300);
  const cleaned = response.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { stop: false, categorie: 'geen', korte_reden: '' };
  }
}

exports.handler = async (event) => {
  try {
    const { reflectionId } = JSON.parse(event.body || '{}');
    const supabase = getSupabase();

    const { data: reflection } = await supabase.from('reflections').select('*').eq('id', reflectionId).single();
    if (!reflection) return { statusCode: 404, body: JSON.stringify({ error: 'Reflectie niet gevonden.' }) };

    const safety = await checkSafety(reflection.raw_content);
    if (safety.stop) {
      await supabase.from('reflections').update({
        status: 'veiligheid_gestopt',
        safety_category: safety.categorie,
      }).eq('id', reflectionId);
      return { statusCode: 200, body: JSON.stringify({ ok: true, stopped: true }) };
    }

const systemPrompt = `Je bent een warme, eerlijke reflectiecoach. Iemand deelt een situatie in de categorie "${reflection.category}". Jij helpt die persoon zichzelf beter te begrijpen, VOOR die persoon beslist of een gesprek met de ander nodig is.
BELANGRIJK, HOE JE DIT AANPAKT: ga snel naar de kern, geen overbodige omwegen. Zoek expliciet naar wat er ONDER het oppervlakkige onderwerp zit. Vaak gaat een reactie niet echt over wat er gebeurde, maar over een dieper gevoel zoals gemis, onzekerheid, jaloezie, angst voor afstand, of het gevoel er alleen voor te staan. Durf dat eerlijk te benoemen, ook als het confronterend is, maar nooit als beschuldiging. Formuleer het invoelend: "het lijkt erop dat dit ook ging over..." in plaats van "je zit fout omdat...".

KRITIEKE REGEL: dit is een persoonlijke reflectie voor ÉÉN persoon, je hebt de andere partij niet gehoord. Wees dus nooit hard oordelend over die andere partij, en geef nooit tips of kant-en-klare zinnen om te gebruiken in een gesprek, dat is bewust voorbehouden voor het latere, gedeelde document, niet voor deze reflectie.

Je toon is menselijk en warm, geen kil rapport. Gebruik nooit het lange streepje.

Bouw je antwoord met exact deze onderdelen:
1. situation_summary: een korte, neutrale samenvatting van de situatie in 2 tot 3 zinnen, zodat de persoon zich herkend voelt.
2. deeper_layer: de eerlijke, onderliggende laag, wat er waarschijnlijk echt speelt onder het oppervlakkige onderwerp. Wees hier concreet en durf te benoemen wat je ziet, ook als het confronterend is. 3 tot 5 zinnen.
3. reflection_questions: 3 tot 5 vragen die de persoon aan ZICHZELF kan stellen, geen vragen voor de andere partij, puur zelfreflectie.
4. recommendation: exact een van deze drie waarden: "zelf" (dit is vooral iets om zelf mee aan de slag te gaan, geen gesprek nodig), "gesprek" (dit is best om samen te bespreken), of "twijfel" (kan beide kanten op).
5. recommendation_text: een eerlijke, duidelijke uitleg waarom, 2 tot 4 zinnen. Wees oprecht: als het advies "zelf" is, zeg dat gerust en duidelijk, ook al betekent dat dat er geen gesprek gestart wordt. Verkoop niets, wees gewoon eerlijk.
Antwoord alleen met geldige JSON, geen andere tekst, in dit exacte formaat:
{
  "situation_summary": "...",
  "deeper_layer": "...",
  "reflection_questions": ["...", "...", "..."],
  "recommendation": "zelf",
  "recommendation_text": "..."
}`;

    const userPrompt = `${reflection.raw_content}\n\nGeef je reflectie in het gevraagde JSON-formaat, in het Nederlands.`;

    const aiResponse = await callClaude(systemPrompt, userPrompt, 2500);
    const cleaned = aiResponse.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

   await supabase.from('reflections').update({
      situation_summary: parsed.situation_summary,
      deeper_layer: parsed.deeper_layer,
      reflection_questions: parsed.reflection_questions,
      recommendation: parsed.recommendation,
      recommendation_text: parsed.recommendation_text,
      status: 'klaar',
    }).eq('id', reflectionId);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    try {
      const { reflectionId } = JSON.parse(event.body || '{}');
      const supabase = getSupabase();
      await supabase.from('reflections').update({ status: 'mislukt' }).eq('id', reflectionId);
    } catch (e) { /* niets meer aan te doen */ }
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
