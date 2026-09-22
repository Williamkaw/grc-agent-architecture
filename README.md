# GRC Agent Architecture

**A tiered, ISO 27001-literate agent system for an ISMS/GRC dashboard, designed by a practicing ISO 27001:2022 Lead Auditor, not retrofitted onto one.**

This is a sanitized architecture case study. No live data, credentials, project references, or company-identifying detail are included, every screenshot and code sample here has been rebuilt or redacted from a real, running system.

---

## Why this exists

Most GRC dashboards are static: a spreadsheet-shaped UI where a human types "Implemented" into a cell and hopes it's still true next quarter. The interesting problem isn't "add a chatbot to the dashboard": it's deciding **which parts of a GRC workflow an AI agent should touch autonomously, which parts it should only propose, and which parts it should never touch at all.** That decision is a GRC judgment call as much as an engineering one, and it's the core design principle behind everything here.

## The tiering model

Every agent in this system is classified before it's built, not after:

| Tier | Behavior | Example |
|---|---|---|
| **Tier 1, Autonomous** | Read-only, informational, or drafting-only. No approval needed because getting it wrong wastes time, not trust. | Daily industry news digest; drafting (not finalizing) a management review input pack |
| **Tier 2, Propose & approve** | The agent drafts a specific, attributable change. Nothing writes to a real record until a human clicks Approve. | Document-based Statement of Applicability updates; KPI status comment suggestions |
| **Tier 3, Never agent-initiated** | Hard-blocked in the system prompt, not just soft-gated. | Marking a control "Implemented" for audit purposes; accepting a risk; closing a nonconformity as verified |

The dividing line: if getting it wrong just wastes someone's time, it's Tier 1 or 2. If getting it wrong creates a false compliance signal, such as an auditor seeing "Implemented" when it isn't real, it's Tier 3.

## The agents

### 1. GRC Copilot (Tier 2)
A chat interface grounded entirely in the org's own live data: no general knowledge answers about the org's posture, only what's actually in the database plus whatever document the user attaches. Proposes field-level updates as approve/reject cards; never writes directly.

### 2. Policy/Document Review (Tier 2)
Compares an uploaded policy against a chosen framework (ISO 27001, ISO 42001, GDPR, etc.) and returns specific gaps, each grounded in an actual quote from the document, never a generic checklist.

### 3. Statement of Applicability Document Intelligence (Tier 2)
The highest-stakes agent here, and the one with the most deliberate constraints. Given an uploaded ISMS/policy document, it compares it against the organization's own existing controls and proposes status updates, but:
- **Never infers a status from silence.** A document not mentioning a control is not evidence the control doesn't exist elsewhere. It simply doesn't propose anything for that control.
- **Reports downgrades honestly.** If the document's evidence contradicts a currently-recorded "Implemented" status, it says so. It does not suppress bad news to look more polished.
- Every proposal carries a confidence level (High/Medium/Low) and the exact quote it's based on, so a human reviewer can weight it accordingly rather than trusting it blindly.

### 4. Reporting Agent: Management Review Drafting (Tier 1)
Structured explicitly around **ISO/IEC 27001:2022 Clause 9.3.2**, which lists seven required inputs to a management review, verbatim, from (a) to (g). Rather than a generic "summarize our posture" prompt, the agent's system prompt mirrors the clause's own structure section-by-section, and, critically, is instructed to say **"No data currently tracked for this input"** rather than fabricate content for any section the underlying system doesn't actually track yet. A polished-looking but fabricated management review input is worse than an honest gap.

### 5. Industry Intelligence (Tier 1)
A scheduled agent that curates cybersecurity/GRC/framework-update news relevant to the org's tracked standards, tagging items with which control they affect where relevant (e.g. "Affects ISO 27001 A.8.5"). Pure external curation. It never touches internal compliance data, so it needs no approval gate.

## Design principles that hold across all five

- **Ground every claim in a citation.** No agent states something as fact without pointing to where that fact came from: a document quote, a database row, a search result.
- **Confidence is a first-class output, not an afterthought.** Where an agent is inferring rather than reading a fact directly, it says how confident it is, in plain language a non-technical reviewer can weigh.
- **Silence is not evidence.** The single most repeated constraint across every system prompt in this project: an agent must never treat "the document doesn't mention X" as proof that X is false.
- **A human is always the last signature on anything audit-facing.** Every Tier 2 agent produces a *proposal* object, never a direct write. The approve/reject UI is the same component reused across every agent, so the review experience is consistent no matter which agent produced the suggestion.

## Stack

- **Frontend:** a single-page vanilla JS dashboard (no framework) with a realtime data layer
- **Backend:** serverless functions (Deno-based edge functions) calling the Claude API, one function per agent
- **Data:** Postgres with row-level realtime subscriptions, so the UI reflects agent-approved changes immediately
- **Model:** Claude, with the server-side web search tool for the news and research agents, and structured tool-calling for every proposal-generating agent

## Roadmap (not yet built)

- **Evidence snapshots**: instead of a human typing "MFA enforced: Yes," a connector agent would pull the actual system config (e.g. via Microsoft Graph or a Google Workspace Admin SDK), hash it, and timestamp it. A checkbox becomes a piece of evidence an auditor can't dispute. Deliberately paused pending proper OAuth app registration in a real tenant, not something to fake for a demo.
- **Connectors to company software** (Microsoft 365, Google Workspace, AWS, Okta): the natural extension of the evidence-snapshot idea, gated on the same reasoning: real credentials, real scopes, real audit trail, or not built at all.
- **Generalizing beyond a single organization**: every agent here is written to take "which org's data" as a parameter rather than assuming one tenant, so this architecture is meant to grow into a multi-tenant platform rather than stay a single dashboard.

## What's *not* in this repo

Real Supabase project references, API keys, actual control statuses, risk register entries, vendor names, or any other data belonging to the organization this was originally built for. Code samples under `/samples` have been rewritten with placeholder table names and no live credentials.

---

*Built by William Bill Kawah, an ISO/IEC 27001:2022 Lead Auditor and CISM holder. The GRC judgment embedded in these prompts (what counts as evidence, when silence isn't an answer, which decisions a machine should never make) is the actual point of this project.*
