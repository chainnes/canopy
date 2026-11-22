# Safety notes for this slice

These checks run in unit tests. They are not a Promptfoo red-team report, and no pass-rate number here was produced by a model eval.

| Risk | What this slice does |
| --- | --- |
| Prompt injection inside a job post | The post is data. A regex flags “ignore previous instructions” and similar lines. The summary does not repeat the injected claim. |
| Scam bait | Upfront fees, crypto, off-platform payment, credential asks, and a too-good urgent rate become red flags. Fit is forced to poor. |
| Ungrounded draft claims | Cover-note lines must be profile quotes, a short frame, or start with `[VERIFY]`. |
| Off-schema model output | One repair retry. A second failure is stored on the review queue with reason `model_output_off_schema: …`. The desk does not invent a score. |
| Sending or submitting | No send, submit, or login tool exists. Drafts stay pending until a person confirms. Confirming email is simulated unless a webhook URL is set. |

Out of scope here: Llama Guard, a live web fetch, and a generated eval table.
