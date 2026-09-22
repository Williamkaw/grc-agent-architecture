# Sample: SoA Document Intelligence Agent

This is the actual, unmodified logic behind the "Statement of Applicability Document Intelligence" agent described in the main repo README, included here because it needed almost no sanitizing: no hardcoded project references, API keys, or organization-specific naming ever existed in it. Credentials come from environment variables at deploy time, and the table/column names are standard ISO 27001 SoA terminology, not identifying detail.

## What to notice

**The `PROPOSE_TOOL` schema forces structure onto the model's output.** Rather than parsing free text and hoping for a consistent shape, the agent is given a tool definition it must call once per proposal, so `control_id`, `proposed_status`, `evidence_quote`, `reasoning`, and `confidence` are guaranteed to exist on every item the frontend receives.

**The system prompt's five rules are ordered by importance on purpose.** Rule 1 (never infer from silence) is listed first and repeated in different words, because it is the single easiest failure mode for a model asked to "check coverage" against a document: the natural (and wrong) move is to treat an unmentioned control as evidence of absence.

**The function never writes to the database.** It reads controls to build context, calls the model, and returns proposals as plain JSON. The write only happens later, in the frontend, and only after a human clicks Approve on a specific proposal. That separation is what makes this a Tier 2 agent rather than a Tier 1 or Tier 3 one.

## Where this would change for a multi-tenant version

The one thing this sample assumes that a true multi-tenant version (like the CLARA platform this architecture is migrating into) would need to parameterize: which organization's `statement_of_applicability` rows to query. Here it implicitly queries "the" table because the original deployment was single-tenant; a multi-tenant version would take an `org_id` and filter on it, with row-level security enforcing that a request can only ever see its own organization's controls.
