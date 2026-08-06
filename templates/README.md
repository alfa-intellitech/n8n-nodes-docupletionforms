# Workflow templates

Ready-to-import n8n workflows built around this package. Each `.json` file is a
standard n8n workflow export — import it via **Workflows → Import from File**
(or copy the JSON and use **Import from URL**/paste), then:

1. Select or create your **DocupletionForms API** credential on each
   DocupletionForms node.
2. Fill in the empty **Form** / **Document Set** fields (left blank
   intentionally so you pick your own).
3. Add credentials for any other service the template uses (Slack, Google
   Sheets, Google Drive, OpenAI) — also left unset.

| Template | What it does |
|---|---|
| [`new-submission-slack-notification.json`](new-submission-slack-notification.json) | **New Form Submission → Slack Notification.** Fires on every new submission for a chosen form and posts a formatted summary (form name, submission number, non-empty answers) to a Slack channel. |
| [`merged-document-to-google-drive.json`](merged-document-to-google-drive.json) | **Merged Document → Auto-Upload to Google Drive.** Fires when a submission is merged into a PDF for a chosen document set, downloads the file from the delivered `file_url`, and uploads it to Google Drive under its original file name. |
| [`sync-submissions-to-google-sheets.json`](sync-submissions-to-google-sheets.json) | **Sync New Submissions to Google Sheets.** Fires on every new submission and appends (or updates, matched by row) a row in a Google Sheet — an event-driven alternative to polling with *List Submissions*. |
| [`bulk-export-merged-documents.json`](bulk-export-merged-documents.json) | **Bulk Export All Merged Documents for a Document Set.** Manually triggered: lists every merged document for a document set, then downloads each one as binary data — useful for an end-of-period export run. |
| [`ai-agent-for-docupletionforms.json`](ai-agent-for-docupletionforms.json) | **AI Agent for DocupletionForms.** A chat-driven AI Agent with two DocupletionForms tools attached (*Submit Form*, *List Submissions*) so it can fill out a form or look up existing submissions from natural-language requests. Add more tool instances the same way (drag another DocupletionForms node onto the agent's Tool port, pick a different Resource/Operation) to expose more capabilities. |

All templates were built and verified against a real n8n instance with this
package installed from npm via Community Nodes — each imports cleanly with no
"unrecognized node" errors; the only warnings you'll see after import are the
intentionally-empty Form/Document Set/credential fields described above.
