# n8n-nodes-docupletionforms

n8n community node for **DocupletionForms** — conditional logic forms with automated PDF document generation.

## Nodes

- **DocupletionForms** — Actions: Save & Edit Later, Prefill & Submit Later.
- **DocupletionForms Trigger** — Webhook triggers: New Form Submitted, New Merged Document.
- **DocupletionForms Tool** — AI agent tool: save draft, prefill link, get submission, get merged document, list submissions.

## Setup

1. Install the package in your n8n instance (or use as a custom extension).
2. Add a **DocupletionForms API** credential with your **API Key** and **Base URL** (default: `https://app.docupletionforms.com/api`).
3. Use any of the three nodes in your workflows.

## Development (Docker)

1. Clone and install: `npm install`
2. Build: `npm run build`
3. Start n8n with the node loaded: `npm run dev:docker` (or `docker compose up` after building).
4. Open http://localhost:5678 and confirm **DocupletionForms**, **DocupletionForms Trigger**, and **DocupletionForms Tool** appear in the node list.
5. For **webhook trigger** testing, DocupletionForms must be able to POST to your n8n instance. If n8n runs only on localhost, use a tunnel (e.g. [ngrok](https://ngrok.com)) and set the webhook base URL (e.g. `WEBHOOK_URL` or `N8N_HOST`) so the registered webhook URL is the public tunnel URL.
6. Optional: set `N8N_LOG_LEVEL=debug` in `docker-compose.yml` if nodes do not show up.
7. After code changes, run `npm run build` then `docker compose restart n8n`.

## Example workflows

- **Trigger on new submission:** Add DocupletionForms Trigger (event: New Form Submitted), choose a form, then process the payload in the next nodes.
- **Save & Edit Later:** Use DocupletionForms with operation “Save & Edit Later”, select form and field values, then send the returned `editUrl` to the respondent.
- **Prefill & Submit Later:** Use DocupletionForms with operation “Prefill & Submit Later”, select form and prefill data, then share the returned `prefillUrl`.
- **AI Agent:** Connect an AI Agent node to DocupletionForms Tool, then ask the agent to create a draft, get a prefill link, or list submissions using natural language.

## API reference

See [docs/API.md](docs/API.md) for the list of DocupletionForms endpoints used by this package.

## License

MIT
