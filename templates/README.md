# Workflow templates

Ready-to-import n8n workflows built around this package. Each `.json` file is a
standard n8n workflow export — import it via **Workflows → Import from File**
(or copy the JSON and use **Import from URL**/paste). Every template includes
an in-canvas sticky note with the full description and setup steps, so once
imported you'll see them right there too.

1. Select or create your **DocupletionForms API** credential on each
   DocupletionForms node.
2. Fill in the empty **Form** / **Document Set** fields (left blank
   intentionally so you pick your own).
3. Add credentials for any other service the template uses (Slack, Google
   Sheets, Google Drive, OpenAI) — also left unset.

| Template | What it does |
|---|---|
| [`new-submission-slack-notification.json`](new-submission-slack-notification.json) — *Post DocupletionForms submissions to Slack* | Fires on every new submission for a chosen form and posts a formatted summary (form name, submission number, non-empty answers) to a Slack channel. |
| [`merged-document-to-google-drive.json`](merged-document-to-google-drive.json) — *Upload merged DocupletionForms PDFs to Google Drive* | Fires when a submission is merged into a PDF for a chosen document set, downloads the file from the delivered `file_url`, and uploads it to Google Drive under its original file name. |
| [`sync-submissions-to-google-sheets.json`](sync-submissions-to-google-sheets.json) — *Sync DocupletionForms submissions to Google Sheets* | Fires on every new submission and appends (or updates, matched by row) a row in a Google Sheet — an event-driven alternative to polling with *List Submissions*. |
| [`bulk-export-merged-documents.json`](bulk-export-merged-documents.json) — *Export all merged documents from a DocupletionForms document set* | Manually triggered: lists every merged document for a document set, then downloads each one as binary data — useful for an end-of-period export run. |
| [`ai-agent-for-docupletionforms.json`](ai-agent-for-docupletionforms.json) — *Submit and look up DocupletionForms forms with OpenAI chat agents* | A chat-driven AI Agent with two DocupletionForms tools attached (*Submit Form*, *List Submissions*) so it can fill out a form or look up existing submissions from natural-language requests. Add more tool instances the same way (drag another DocupletionForms node onto the agent's Tool port, pick a different Resource/Operation) to expose more capabilities. |
| [`ai-document-intelligence-assistant.json`](ai-document-intelligence-assistant.json) — *Summarize merged DocupletionForms PDFs with AI and chat to ask questions later* | Fires on *Document Merged*, extracts the PDF's text, and uses an LLM chain with a structured output parser to summarize it and pull out a category and key points. The summary posts to Slack and logs to a Notion database while the original PDF archives to Google Drive; the extracted text is also indexed into a vector store so a second, chat-triggered agent can answer follow-up questions about any document processed this way. |

All templates were built and verified against a real n8n instance with this
package installed from npm via Community Nodes — each imports cleanly with no
"unrecognized node" errors; the only warnings you'll see after import are the
intentionally-empty Form/Document Set/credential fields described above.
`ai-document-intelligence-assistant.json` is schema-validated (structurally
self-consistent, all node/connection references resolve) but not yet
confirmed by a live import — the disposable local test instance used for
that step currently has no outbound network path to GitHub's CDN, unrelated
to the file itself.

## Creator Portal submission

These are also formatted to meet [n8n's template submission
guidelines](https://n8n.notion.site/Template-submission-guidelines-9959894476734da3b402c90b124b1f77):
a mandatory yellow description sticky (with the required Who's it for / How it
works / How to set up / Requirements / How to customize sections), neutral
step notes, an SEO-style title, and an embedded workflow screenshot at the top
(under [`images/`](images)). `n8n-nodes-docupletionforms` is a **verified**
node available on both n8n Cloud and self-hosted instances.
