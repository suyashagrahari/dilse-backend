// ─── Which OpenAI model writes prospect mail ─────────────────────────────────
//
// The rest of the site drafts with gpt-4o-mini. Outreach to creators is the
// one place where the quality of a few sentences decides whether anyone
// replies, so prospect drafting (and reading analytics screenshots) uses the
// strongest chat model the configured key can reach:
//
//   1. PROSPECT_AI_MODEL, when set — an explicit override, used as is.
//   2. Otherwise the models list is asked ONCE per process (cached) and the
//      newest flagship GPT-5-family model is taken: a bare "gpt-5", "gpt-5.1",
//      "gpt-5.5" … — never -mini / -nano / -pro / -codex / -search / dated
//      snapshots / experimental suffixes.
//   3. Else the newest o-series reasoning model (o3, o1).
//   4. Else gpt-4.1, else gpt-4o, else OPENAI_MODEL / gpt-4o-mini.
//
// GPT-5 and o-series models are reasoning models: they take
// `max_completion_tokens` and `reasoning_effort`, and refuse `temperature`.
// If the chosen model refuses the request outright (removed, no access, a
// parameter it does not take), the call is retried once on gpt-4o and the
// fallback is cached, so one bad pick does not break Generate.
//
// The model id is logged once (never the key).

import OpenAI from "openai";
import { env } from "../config/env";
import type { Completion } from "./influencerMailAi.service";

export const FALLBACK_MODEL = "gpt-4o";
const currentModel = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

/** "gpt-5.5" → [5, 5]; "gpt-5" → [5, 0]; anything else → null. */
function gpt5Version(id: string): number | null {
  const m = /^gpt-5(?:\.(\d+))?$/.exec(id);
  return m ? Number(m[1] || 0) : null;
}

/** "o3" → 3; "o1" → 1; suffixed (o3-mini, o3-pro, o3-deep-research) → null. */
function oSeriesVersion(id: string): number | null {
  const m = /^o(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/**
 * The best model in `ids` for writing. Pure — the selection rule, tested.
 * Returns `fallback` when nothing better is listed.
 */
export function pickBestModel(ids: string[], fallback: string = currentModel()): string {
  const list = [...new Set((ids || []).map((s) => String(s || "").trim()).filter(Boolean))];
  let best: { id: string; v: number } | null = null;
  for (const id of list) {
    const v = gpt5Version(id);
    if (v !== null && (!best || v > best.v)) best = { id, v };
  }
  if (best) return best.id;
  let o: { id: string; v: number } | null = null;
  for (const id of list) {
    const v = oSeriesVersion(id);
    if (v !== null && v >= 3 && (!o || v > o.v)) o = { id, v };
  }
  if (o) return o.id;
  for (const id of ["gpt-4.1", "gpt-4o"]) if (list.includes(id)) return id;
  if (list.includes("o1")) return "o1";
  return fallback;
}

/** Reasoning models take max_completion_tokens + reasoning_effort, not temperature. */
export function isReasoningModel(id: string): boolean {
  return /^(gpt-5|o\d)/.test(String(id || ""));
}

/** The request body for one JSON-schema chat completion on `model`. Pure. */
export function completionParams(
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  schema: { name: string; schema: Record<string, unknown> },
  o: { temperature?: number; maxTokens?: number } = {}
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const base = {
    model,
    messages,
    response_format: { type: "json_schema" as const, json_schema: { name: schema.name, strict: true, schema: schema.schema } },
  };
  if (isReasoningModel(model)) {
    // Reasoning tokens count against the limit, so it is generous.
    return { ...base, max_completion_tokens: Math.max(4000, (o.maxTokens || 1100) * 4), reasoning_effort: "low" };
  }
  return { ...base, temperature: o.temperature ?? 0.6, max_tokens: o.maxTokens || 1100 };
}

let client: OpenAI | null = null;
const openai = () => (client ||= new OpenAI({ apiKey: env.OPENAI_API_KEY }));

let resolved: Promise<string> | null = null;
let logged = "";

function logModel(id: string, why: string) {
  if (logged === id) return;
  logged = id;
  console.log(`[prospect AI] drafting with ${id} (${why})`);
}

/** Tests only. */
export function _resetModelCacheForTests(): void {
  resolved = null;
  logged = "";
}

/**
 * The model prospect drafting uses. Cached per process. `list` is injectable
 * for tests; it defaults to the OpenAI models endpoint.
 */
export function resolveProspectModel(list: () => Promise<string[]> = async () => {
  const ids: string[] = [];
  for await (const m of openai().models.list()) ids.push(m.id);
  return ids;
}): Promise<string> {
  const override = String(process.env.PROSPECT_AI_MODEL || "").trim();
  if (override) {
    logModel(override, "PROSPECT_AI_MODEL");
    return Promise.resolve(override);
  }
  if (!resolved) {
    resolved = list()
      .then((ids) => {
        const id = pickBestModel(ids);
        logModel(id, `best of ${ids.length} models on this key`);
        return id;
      })
      .catch((error) => {
        // Never cache a failed lookup: the next draft asks again.
        resolved = null;
        const id = FALLBACK_MODEL;
        console.warn(`[prospect AI] could not list models (${(error as Error)?.message || "error"}); using ${id}`);
        return id;
      });
  }
  return resolved;
}

/** Errors that mean "this model will not take this request" rather than a blip. */
function isModelRefusal(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === 400 || status === 403 || status === 404;
}

const draftSchema = {
  name: "prospect_mail_draft",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reading", "subject", "body"],
    properties: { reading: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
  },
};

async function runCompletion(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  schema: { name: string; schema: Record<string, unknown> },
  o: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const model = await resolveProspectModel();
  try {
    const r = await openai().chat.completions.create(completionParams(model, messages, schema, o));
    return r.choices?.[0]?.message?.content || "";
  } catch (error) {
    if (model === FALLBACK_MODEL || !isModelRefusal(error)) throw error;
    console.warn(`[prospect AI] ${model} refused the request (${(error as Error)?.message || "error"}); falling back to ${FALLBACK_MODEL}`);
    resolved = Promise.resolve(FALLBACK_MODEL);
    logModel(FALLBACK_MODEL, `fallback after ${model} refused`);
    const r = await openai().chat.completions.create(completionParams(FALLBACK_MODEL, messages, schema, o));
    return r.choices?.[0]?.message?.content || "";
  }
}

/** The prospect drafter's completion: best model, JSON {reading, subject, body}. */
export const prospectCompletion: Completion = (system, user) =>
  runCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    draftSchema
  );

/** A vision completion: one image (data URL or https) + instructions → JSON matching `schema`. */
export type VisionCompletion = (system: string, user: string, imageUrl: string, schema: { name: string; schema: Record<string, unknown> }) => Promise<string>;

export const visionCompletion: VisionCompletion = (system, user, imageUrl, schema) =>
  runCompletion(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        ],
      },
    ],
    schema,
    { temperature: 0, maxTokens: 900 }
  );
