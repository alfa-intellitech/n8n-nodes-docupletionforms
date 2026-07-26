# DocupletionForms N8N Nodes

n8n community node for **DocupletionForms** — conditional logic forms with automated PDF document generation.

## Nodes

- **DocupletionForms** — two resources:
  - *Form Submission*: Submit Form, Generate Prefilled Link, List Submissions
  - *Merged Document*: List Document Sets, List Merged Documents, Download Merged Document (binary PDF)
- **DocupletionForms Trigger** — webhook that fires when a submission generates a merged PDF for a chosen document set. (There is no separate "new form submitted" event on the backend — merging is the only webhook-backed event.)
- **DocupletionForms Tool** — AI agent tool: Submit Form, Prefill Form Link, List Submissions, List Document Sets, List Merged Documents, with configurable output modes (`Simplified`, `Raw`, `Selected Fields`) to control AI context size. (Download Merged Document is main-node only — the Tool node's output is text/JSON, and a PDF is binary.)

See [docs/API.md](docs/API.md) for exactly which backend endpoint each operation calls.

## Setup

1. Install the package in your n8n instance (or use as a custom extension).
2. Add a **DocupletionForms API** credential with:
   - **API Key** — a DocupletionForms user access token.
   - **Tenant ID** — the numeric organization/tenant ID that key belongs to (every API route is tenant-scoped; find it in the app URL or on the Manage Account page).
   - **Base URL** — default `https://app.docupletionforms.com/api`.
3. Use any of the three nodes in your workflows.

## Development (Docker)

There is no bundled `docker-compose.yml` for this package — `npm run dev:docker` in `package.json` assumes one and won't work as-is. To run against a DocupletionForms backend instance (internal contributors: see the backend repo for how to run one locally):

1. Build: `npm install && npm run build`
2. Run n8n on the same Docker network as the backend, with this package's `dist/` mounted as a custom extension:
   ```
   docker run -d --name n8n-dev \
     --network <backend-compose-project>_default \
     -p 5678:5678 \
     -e N8N_CUSTOM_EXTENSIONS=/custom \
     -v $(pwd)/dist:/custom:ro \
     n8nio/n8n:latest
   ```
3. Open http://localhost:5678, complete the one-time owner setup, and confirm **DocupletionForms**, **DocupletionForms Trigger**, and **DocupletionForms Tool** appear in the node list.
4. Point the credential's **Base URL** at the backend's in-network address (its Docker container name, not `localhost`), since n8n is reaching it over the Docker network.
5. For **webhook trigger** testing, DocupletionForms must be able to POST to your n8n instance. If n8n runs only on localhost, use a tunnel (e.g. [ngrok](https://ngrok.com)) and set `WEBHOOK_URL`/`N8N_HOST` so the registered webhook URL is the public tunnel URL.
6. After code changes: `npm run build`, then `docker restart n8n-dev` (custom extensions are loaded at startup, not hot-reloaded).

## Example workflows

- **Submit Form:** DocupletionForms → Form Submission → Submit Form, select a form and field values, then use the returned `url` (the edit link).
- **Generate Prefilled Link:** DocupletionForms → Form Submission → Generate Prefilled Link, select a form and prefill data, then share the returned `url`.
- **Sync submissions to a spreadsheet/CRM:** DocupletionForms → Form Submission → List Submissions, with "Return All" on, feeding into whatever downstream node writes the data out.
- **Deliver a generated document:** List Merged Documents (to find a submission's `template_id`) → Download Merged Document (same document set, that `template_id` + `submission_id`) → attach the resulting binary to an email/Slack message.
- **Trigger on merged document:** DocupletionForms Trigger, pick a document set, then process the delivered `file_url`/`submission` payload in the next nodes.
- **AI Agent:** Connect an AI Agent node to DocupletionForms Tool, then ask the agent to submit a form, get a prefill link, or list submissions/document sets using natural language.
- **AI output control:** In DocupletionForms Tool, set **Output** to `Simplified`, `Raw`, or `Selected Fields` depending on how much response data your agent needs.

## API reference

See [docs/API.md](docs/API.md) for the list of DocupletionForms endpoints used by this package.

## License

MIT
