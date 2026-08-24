// supabase/functions/translate-service/index.ts
//
// Two modes, both mapping one name to its counterpart in the other script.
//
//   mode: 'translate'      (default) — service names. Meaning crosses over:
//                          غسيل الردييتر ⇄ Radiator flush.
//   mode: 'transliterate'  — customer names. Sound crosses over, meaning
//                          does not: يوسف ⇄ Yousef, never Joseph.
//   mode: 'model'          — a make's whole model lineup, fetched once per
//                          make ever and stored in vehicle_model_catalog.
//                          Returns a list, not a name, and writes to the
//                          database under the service role. Requires `make`.
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
// Forty covers the widest lineup that reaches a workshop in Amman — Toyota,
// Hyundai, Kia, Mercedes — with room to spare. Most makes return half that.
const MODEL_LIMIT = 40;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json'
    }
  });
}
/**
 * A make's model lineup, fetched once and stored. Called again for the same
 * make it replays what is stored — cheap idempotency, and the thing that makes
 * two staff picking the same make at the same moment harmless.
 */
async function modelCatalogue(apiKey, supabase, make, staffId) {
  // The caller's client can read these; only the service role writes them.
  const { data: already } = await supabase.from('vehicle_model_fetches').select('make').eq('make', make).maybeSingle();
  if (already) {
    const { data: stored } = await supabase.from('vehicle_model_catalog').select('name_en, name_ar').eq('make', make).eq('active', true).order('name_en');
    return json({
      make,
      models: stored ?? [],
      count: (stored ?? []).length
    });
  }
  const system = cataloguedPrompt(make);
  // Opus, not Haiku: this is recall, where a plausible-sounding model that
  // does not exist is the exact failure mode, and it runs once per make ever.
  //
  // max_tokens has to cover thinking as well as output. Opus 5 thinks by
  // default, so the 2048 sized for "forty short lines" was spent reasoning
  // and the reply carried no text block at all. Low effort because listing a
  // manufacturer's models is recall, not a problem to work through.
  const reply = await askClaude(apiKey, {
    model: 'claude-opus-5',
    maxTokens: 16000,
    system,
    user: make,
    outputConfig: {
      effort: 'low'
    },
    // A safety classifier can decline a request outright — HTTP 200,
    // stop_reason 'refusal', nothing generated. Rather than fail the fetch,
    // let the API re-run it on a fallback model inside the same call.
    // 'default' routes by refusal category, so there is no model list here
    // to go stale.
    fallbacks: 'default',
    beta: 'server-side-fallback-2026-07-01'
  });
  if (reply === null) return json({
    error: 'The model list could not be fetched.'
  }, 502);
  // A refusal that even the fallback did not rescue. Distinct from an empty
  // reply: nothing was generated and nothing will be by retrying the same
  // request, but it is still not an answer about this make's lineup.
  if (reply.stopReason === 'refusal') {
    console.error('[catalogue] the request was declined', {
      make,
      stop_details: reply.stopDetails,
      served_by: reply.servedBy
    });
    return json({
      error: 'The model list was declined.'
    }, 502);
  }
  // An empty reply is not an empty lineup. Returning here rather than falling
  // through means no fetch row is written, so the make is retried instead of
  // being recorded as having no models for good.
  if (!reply.text) {
    console.error('[catalogue] no text block in the reply', {
      make,
      stop_reason: reply.stopReason,
      block_types: reply.blockTypes,
      served_by: reply.servedBy,
      usage: reply.usage
    });
    return json({
      error: 'The model list came back empty.'
    }, 502);
  }
  const { models, rejected } = parseModelLines(reply.text);
  // Kept: a lineup that parsed to nothing is worth a line, and the reasons
  // are how a format drift is spotted without redeploying to find out.
  if (models.length === 0 || rejected.length > 0) {
    console.warn('[catalogue] lines dropped', {
      make,
      accepted: models.length,
      rejected: rejected.length,
      rejections: rejected
    });
  }
  // A write needs the service role: there is no client insert policy on
  // either table, by design.
  const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (models.length > 0) {
    await admin.from('vehicle_model_catalog').insert(models.map((m)=>({
        make,
        name_en: m.name_en,
        name_ar: m.name_ar,
        origin: 'generated',
        created_by: staffId
      }))).select('name_en');
  }
  // Written even when the list is empty — that is the whole point of the
  // table. A failed call returned above and writes nothing, so it retries.
  await admin.from('vehicle_model_fetches').upsert({
    make,
    model_count: models.length,
    fetched_by: staffId
  }, {
    onConflict: 'make'
  });
  return json({
    make,
    models,
    count: models.length
  });
}
/**
 * One model per line, `Latin|Arabic`. Deliberately not JSON: a truncated line
 * is discardable, truncated JSON is unparseable.
 */
function parseModelLines(out) {
  const rejected = [];
  if (!out || out === 'UNCLEAR') return {
    models: [],
    rejected
  };
  const seen = new Set();
  const models = [];
  for (const line of out.split('\n')){
    const raw = line.trim();
    if (!raw) continue;
    if (models.length >= MODEL_LIMIT) {
      rejected.push({
        line: raw,
        why: 'over the ' + MODEL_LIMIT + '-model cap'
      });
      continue;
    }
    const parts = raw.split('|');
    // A bare Latin name is accepted: a real model with no Arabic spelling
    // offered is worth more than a dropped line.
    if (parts.length > 2) {
      rejected.push({
        line: raw,
        why: 'more than one | separator'
      });
      continue;
    }
    const name_en = parts[0].trim();
    const name_ar = (parts[1] ?? '').trim();
    // The Latin side is the identifier and must be Latin; the Arabic side is
    // optional but must not be Latin if it is there.
    if (!name_en) {
      rejected.push({
        line: raw,
        why: 'no Latin name'
      });
      continue;
    }
    if (ARABIC.test(name_en)) {
      rejected.push({
        line: raw,
        why: 'Arabic script in the Latin name'
      });
      continue;
    }
    const key = name_en.toLowerCase();
    if (seen.has(key)) {
      rejected.push({
        line: raw,
        why: 'duplicate of an earlier line'
      });
      continue;
    }
    seen.add(key);
    models.push({
      name_en,
      name_ar: name_ar && ARABIC.test(name_ar) ? name_ar : null
    });
  }
  return {
    models,
    rejected
  };
}
function cataloguedPrompt(make) {
  return [
    'You list the vehicle models a manufacturer sells, for an automotive repair shop in Amman, Jordan.',
    '',
    `The make is ${make}.`,
    '',
    'List that manufacturer\'s model lineup. Prefer models sold in Jordan and the wider Levant — those are what come through this workshop — and include a model that is common on the road here even if it is no longer sold new.',
    '',
    'One model per line, in exactly this format:',
    '<Latin name>|<Arabic spelling>',
    '',
    'The Latin name is the manufacturer\'s own spelling, exactly as they write it: Land Cruiser, not Landcruiser. CR-V, not CRV.',
    'The Arabic spelling is how the name is commonly written in Arabic in Jordan. Transliterate the sound, never the meaning — Camry is كامري.',
    'No trim levels, no engine sizes, no model years, no duplicates, no headings, no numbering, no explanation.',
    `At most ${MODEL_LIMIT} lines.`,
    '',
    `Never invent a model. Every line must be a real ${make} model. A short list you are sure of is better than a long one you are not.`,
    `If ${make} is not a real vehicle manufacturer, or you cannot list its models with confidence, reply with exactly: UNCLEAR`
  ].join('\n');
}
/**
 * Returns the reply's text along with enough of the envelope to tell an empty
 * answer apart from a truncated one. `text` alone cannot: a response whose
 * budget went entirely on thinking has no text block at all, and reads
 * identically to a model that had nothing to say.
 *
 * null means the call itself failed.
 */
async function askClaude(apiKey, { model, maxTokens, system, user, outputConfig, fallbacks, beta }) {
  const payload = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: user
      }
    ]
  };
  if (outputConfig) payload.output_config = outputConfig;
  if (fallbacks) payload.fallbacks = fallbacks;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };
  if (beta) headers['anthropic-beta'] = beta;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    console.error('anthropic error', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const blocks = data.content ?? [];
  return {
    text: blocks.filter((b)=>b.type === 'text').map((b)=>b.text).join('').trim(),
    stopReason: data.stop_reason ?? null,
    // Populated only on a refusal: the category and explanation are the API
    // saying why, which beats inferring it from an empty response.
    stopDetails: data.stop_details ?? null,
    blockTypes: blocks.map((b)=>b.type),
    // Which model actually served it — a fallback rescue reports the one
    // that answered, not the one that was asked.
    servedBy: data.model ?? null,
    usage: data.usage ?? null
  };
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
  if (mode !== 'translate' && mode !== 'transliterate' && mode !== 'model') return json({
    error: 'Unknown mode.'
  }, 400);
  const make = (body.make ?? '').trim();
  if (mode === 'model') {
    if (!make) return json({
      error: 'A make is required.'
    }, 400);
    if (make.length > 60) return json({
      error: 'Make is too long.'
    }, 400);
    return await modelCatalogue(apiKey, supabase, make, staff.id);
  }
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
  const reply = await askClaude(apiKey, {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 64,
    system,
    user: name
  });
  if (reply === null) return json({
    error: 'Translation failed.'
  }, 502);
  const out = reply.text;
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
