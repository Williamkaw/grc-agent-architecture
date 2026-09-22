// soa-document-agent (sanitized sample)
//
// Reads an uploaded ISMS/policy document and compares it against an
// organization's OWN existing ISO/IEC 27001:2022 Statement of Applicability
// controls, proposing a status update only where the document gives clear,
// positive evidence.
//
// This is a Tier 2 agent in the tiering model described in the main README:
// it NEVER writes to the database itself. Every proposal is returned to the
// frontend as an approve/reject card, and nothing is saved until a human
// accepts it.
//
// The two design decisions that matter most are both enforced in the system
// prompt below, not left to chance:
//   1. Silence is not evidence. A document not mentioning a control is not
//      proof the control doesn't exist elsewhere, so the agent is forbidden
//      from inferring "Not started" just because a document stays quiet.
//   2. Downgrades are reported as honestly as upgrades. If the document's
//      evidence contradicts a currently-recorded "Implemented" status, the
//      agent is instructed to say so rather than suppress it.
//
// Deployed originally as a Supabase Edge Function (Deno runtime). Table and
// column names below are standard ISO 27001 SoA terminology, not specific to
// any organization; no live project references, keys, or data are included.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STATUS_VALUES = ["Not started", "Planned", "Partial", "Implemented", "Not applicable"];

const PROPOSE_TOOL = {
  name: "propose_control_status",
  description: "Propose a status update for ONE existing Statement of Applicability control, based on clear evidence found in the document. Call once per control with real evidence, never call this for a control the document simply doesn't mention.",
  input_schema: {
    type: "object",
    properties: {
      control_id: { type: "string", description: "The control's id exactly as given, e.g. 'A.5.10'." },
      proposed_status: { type: "string", enum: STATUS_VALUES },
      evidence_quote: { type: "string", description: "A short quote or close paraphrase (under 300 characters) of the specific part of the document that supports this status." },
      reasoning: { type: "string", description: "One or two sentences on why this quote supports the proposed status." },
      confidence: { type: "string", enum: ["High", "Medium", "Low"], description: "High: the document explicitly and unambiguously states this. Medium: reasonably implied. Low: a stretch, flag it as such rather than omitting it." },
    },
    required: ["control_id", "proposed_status", "evidence_quote", "reasoning", "confidence"],
  },
};

Deno.serve(async (req: Request) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { document_text, document_name } = await req.json();
    if (!document_text || typeof document_text !== "string" || !document_text.trim()) {
      return new Response(JSON.stringify({ error: "No document text was extracted, the file may be empty, scanned/image-only, or an unsupported format." }), { status: 400, headers: cors });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server is not configured with an ANTHROPIC_API_KEY secret." }), { status: 500, headers: cors });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: controls, error: controlsErr } = await supabase
      .from("statement_of_applicability")
      .select("id,category,control_name,control_purpose,status")
      .eq("applicable", true)
      .limit(200);
    if (controlsErr) return new Response(JSON.stringify({ error: controlsErr.message }), { status: 500, headers: cors });

    const systemPrompt = `You compare an uploaded ISMS/policy document against an organization's OWN existing ISO/IEC 27001:2022 Statement of Applicability controls (given below) and propose status updates ONLY where the document gives clear, positive evidence.

Rules, in order of importance:
1. NEVER propose a status based on the document simply not mentioning a control. Silence is not evidence of "Not started", the organization may implement that control through a different document you haven't seen. Only propose when the document actually says or clearly implies something about that specific control.
2. Ground every proposal in a real quote or close paraphrase from the document, never fabricate one.
3. If the document's evidence would only IMPROVE on the control's current recorded status (given below per control), that's a normal proposal. If it suggests the control is actually WORSE than currently recorded, propose that too, don't suppress bad news.
4. Use confidence honestly: "High" only for explicit, unambiguous statements. Most real documents will yield mostly Medium and a few Low, that's expected and fine, the human reviewing these will weight them accordingly.
5. Call propose_control_status once per control with real evidence. It's fine, and expected, to find evidence for only a handful of the controls in one document, do not force one for every control.

EXISTING CONTROLS (id, category, name, purpose, current recorded status):
${(controls || []).map((c: any) => `${c.id} | ${c.category} | ${c.control_name} | ${c.control_purpose || ""} | current status: ${c.status}`).join("\n")}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: systemPrompt,
        tools: [PROPOSE_TOOL],
        messages: [{ role: "user", content: `DOCUMENT NAME: ${document_name || "Untitled"}\n\nDOCUMENT TEXT:\n${document_text.slice(0, 60000)}` }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${errText.slice(0, 300)}` }), { status: 502, headers: cors });
    }

    const data = await anthropicRes.json();
    const content = data.content || [];
    const summary = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n\n").trim();
    const controlsById = new Map((controls || []).map((c: any) => [c.id, c]));
    const proposals = content
      .filter((b: any) => b.type === "tool_use" && b.name === "propose_control_status")
      .map((b: any) => {
        const c = controlsById.get(b.input?.control_id);
        return {
          control_id: b.input?.control_id,
          control_name: c ? c.control_name : b.input?.control_id,
          current_status: c ? c.status : null,
          proposed_status: b.input?.proposed_status,
          evidence_quote: b.input?.evidence_quote,
          reasoning: b.input?.reasoning,
          confidence: b.input?.confidence,
        };
      })
      .filter((p: any) => STATUS_VALUES.includes(p.proposed_status) && controlsById.has(p.control_id));

    return new Response(JSON.stringify({ summary: summary || `${proposals.length} proposal(s) from this document.`, proposals }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
