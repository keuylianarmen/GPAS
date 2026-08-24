// supabase/functions/translate-service/index.ts
//
// Two modes, both mapping one name to its counterpart in the other script.
//
//   mode: 'translate'      (default) — service names. Meaning crosses over:
//                          غسيل الردييتر ⇄ Radiator flush.
//   mode: 'transliterate'  — customer names. Sound crosses over, meaning
//                          does not: يوسف ⇄ Yousef, never Joseph.
//
// Direction is detected from the input script, so the caller sends one
// name and gets the other back. Examples are pulled from the shop's own
// rows — the catalogue for services, the customer list for names — which
// is what keeps the register right: the model matches تيل / ترصيص / بنشر
// rather than inventing formal MSA, and spells names the way the shop
// already spells them.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy translate-service
import { createClient } from 'jsr:@supabase/supabase-js@2';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const ARABIC = /[\u0600-\u06FF]/;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json'
    }
  });
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: CORS
  });
  if (req.method !== 'POST') return json({
    error: 'POST only'
  }, 405);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({
    error: 'Translation is not configured.'
  }, 500);
  // ── caller must be signed-in staff ──────────────────────────────────
  const auth = req.headers.get('Authorization');
  if (!auth) return json({
    error: 'Not signed in.'
  }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
    global: {
      headers: {
        Authorization: auth
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({
    error: 'Not signed in.'
  }, 401);
  const { data: staff } = await supabase.from('staff').select('id').eq('user_id', user.id).eq('active', true).maybeSingle();
  if (!staff) return json({
    error: 'Not staff.'
  }, 403);
  // ── input ───────────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch  {
    return json({
      error: 'Bad request.'
    }, 400);
  }
  // Absent means 'translate', so the Services flow — which sends no mode —
  // is byte-for-byte the request it always sent.
  const mode = body.mode ?? 'translate';
  if (mode !== 'translate' && mode !== 'transliterate') return json({
    error: 'Unknown mode.'
  }, 400);
  const name = (body.name ?? '').trim();
  if (!name) return json({
    error: 'Nothing to translate.'
  }, 400);
  if (name.length > 120) return json({
    error: 'Name is too long.'
  }, 400);
  const toEnglish = ARABIC.test(name);
  // ── examples from the shop's own rows ───────────────────────────────
  let pairs;
  if (mode === 'transliterate') {
    // Names this shop already writes both ways. Whatever convention it
    // follows — how the definite article is handled included — travels in
    // these pairs, so the prompt never has to state a rule.
    const { data: people } = await supabase.from('customers').select('name_en, name_ar').not('name_en', 'is', null).not('name_ar', 'is', null).neq('name_en', '').neq('name_ar', '').limit(12);
    pairs = (people ?? []).map((c)=>`${c.name_en}  ⇄  ${c.name_ar}`).join('\n');
  } else {
    let query = supabase.from('services').select('name_en, name_ar, category_id').not('name_ar', 'is', null).limit(12);
    if (body.categoryId) query = query.eq('category_id', body.categoryId);
    let { data: examples } = await query;
    // fall back to a spread across the catalogue if the category is thin
    if (!examples || examples.length < 4) {
      const { data: any } = await supabase.from('services').select('name_en, name_ar').not('name_ar', 'is', null).limit(12);
      examples = any ?? [];
    }
    pairs = (examples ?? []).map((e)=>`${e.name_en}  ⇄  ${e.name_ar}`).join('\n');
  }
  // ── prompt ──────────────────────────────────────────────────────────
  // A new shop has no name pairs yet, and an examples heading with nothing
  // under it reads as an instruction to invent some.
  const examplesBlock = pairs ? [
    'These are names this shop already writes both ways. Match their register and their spelling conventions — including how they handle the Arabic definite article. Infer the convention from these pairs; do not apply a rule of your own:',
    pairs,
    ''
  ] : [];
  const system = mode === 'transliterate' ? [
    'You write customer names for an automotive repair shop in Amman, Jordan in the other script.',
    '',
    toEnglish ? 'Write the Arabic name in Latin letters.' : 'Write the English name in Arabic letters.',
    '',
    'Transliterate the sound. Do not translate the meaning: يوسف is Yousef, never Joseph. عبد الرحمن is a name, not a phrase to be rendered into English words. A person\'s name is spelled in another script, never looked up.',
    'Plain letters only — no academic transliteration marks. No macrons, no dots under letters, no ʿ or ʾ for ع and ء.',
    '',
    ...examplesBlock,
    'Reply with the one name only. No quotes, no explanation, no alternative spellings.',
    'If the input is not a person\'s name, reply exactly: UNCLEAR'
  ].join('\n') : [
    'You translate service names for an automotive repair shop in Amman, Jordan.',
    '',
    toEnglish ? 'Translate the Arabic name into English. Use the plain trade English a workshop would print on an invoice — "Radiator flush", not "Radiator washing".' : 'Translate the English name into Arabic. Use the vernacular a Jordanian mechanic actually says — تيل for brake pads, ترصيص for balancing, بنشر for a puncture, ردييتر for a radiator. Not formal MSA coinages.',
    '',
    'These are existing names from this shop\'s own catalogue. Match their register and length:',
    pairs,
    '',
    'Reply with the translated name only. No quotes, no explanation, no alternatives.',
    'If the input is not a vehicle service, reply exactly: UNCLEAR'
  ].join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      system,
      messages: [
        {
          role: 'user',
          content: name
        }
      ]
    })
  });
  if (!res.ok) {
    console.error('anthropic error', res.status, await res.text());
    return json({
      error: 'Translation failed.'
    }, 502);
  }
  const data = await res.json();
  const out = (data.content ?? []).filter((b)=>b.type === 'text').map((b)=>b.text).join('').trim();
  if (!out || out === 'UNCLEAR') {
    return json({
      error: 'Could not translate that. Enter both names by hand.'
    }, 422);
  }
  // guard against a reply in the wrong script
  if (toEnglish && ARABIC.test(out)) return json({
    error: 'Translation failed.'
  }, 502);
  if (!toEnglish && !ARABIC.test(out)) return json({
    error: 'Translation failed.'
  }, 502);
  return json({
    input: name,
    translation: out,
    direction: toEnglish ? 'ar_to_en' : 'en_to_ar'
  });
});
