# DocupletionForms API (used by this package)

This document lists every DocupletionForms API endpoint used by `n8n-nodes-docupletionforms`, and how this package calls them. Keep it in sync when endpoints or payloads change — the backend's `modules/api/Module.php` is the authoritative route table.

Current implementation note: Tool-node output modes (`Simplified`, `Raw`, `Selected Fields`) only shape the returned node output and do not change API endpoints or request payloads.

---

## Authentication

DocupletionForms' legacy (non-OAuth) auth method is an **`api_key` query parameter**, not a header — there is no `Authorization: Bearer` or `X-API-Key` scheme on this API. Every route below (except one, noted) is also scoped to a tenant via a `/v1/<tenantId>/...` URL segment.

Credential fields:
- **API Key** — a DocupletionForms user access token.
- **Tenant ID** — the numeric organization/tenant ID that key belongs to. Required because the backend has no way to infer a tenant from the API key alone; it must be supplied per request.
- **Base URL** — default `https://app.docupletionforms.com/api`.

Every request this package makes is built as `${baseUrl}/v1/${tenantId}${path}?...&api_key=${apiKey}`.

---

## Endpoints

### GET /v1/&lt;tenantId&gt;/forms

Lists forms for the tenant.

- **Response:** Array of `{ id, name, status, is_draft, ... }`
- **Used by:** Form dropdown (`getForms` loadOptions) in all three nodes.

### GET /v1/&lt;tenantId&gt;/forms/&lt;formId&gt;/templates

Lists PDF templates uploaded for a form, each tagged with the document set (`fillable_pdf_id`) it belongs to.

- **Response:** Array of `{ id, fillable_pdf_id, form_id, name, original_filename, needs_field_mapping, ... }`
- **Used by:** Template dropdown (`getTemplates` loadOptions) on Download Merged Document — looks up the selected document set's `form_id` via `/documents` first, then filters this endpoint's result down to templates whose `fillable_pdf_id` matches.

---

### POST /v1/&lt;tenantId&gt;/forms/&lt;formId&gt;/submit

Submits a form. The request body **is** the field map directly (no wrapping key) — the backend reads it straight off `Yii::$app->request->post()`. Reserved keys `email_address` / `email_subject` / `email_message` trigger a copy of the edit link to be emailed.

- **Body:** `{ "<field_slug>": "<value>", ..., email_address?, email_subject?, email_message? }`
- **Response:** `{ action: "submit", success, id, message, errors, url }` — `url` is the edit link.
- **Used by:** DocupletionForms node → Form Submission → Submit Form; Tool node → Submit Form.
- **Note:** there is no link-expiry setting on this endpoint. Not reachable by OAuth/MCP clients (`blockOauthClients()` on the backend) — legacy `api_key` auth only, which is all this package uses.

### POST /v1/&lt;tenantId&gt;/forms/&lt;formId&gt;/prefill

Builds a URL to the public form with the given fields pre-populated. Nothing is persisted — the link just carries the values as a query string.

- **Body:** `{ "<field_slug>": "<value>", ..., email_address?, email_subject?, email_message? }` (same flat shape as submit)
- **Response:** `{ action: "prefill", success, id, message, url }`
- **Used by:** DocupletionForms node → Form Submission → Generate Prefilled Link; Tool node → Prefill Form Link.
- **Note:** no lock-fields, redirect-URL, or expiry support server-side — those parameters don't exist on this endpoint even though similar-looking ones show up in some third-party API docs.

### GET /v1/forms/&lt;formId&gt;/submissions

Lists submissions for a form, newest first. **This is the one route with no tenant segment** — registered separately in `modules/api/Module.php` as `api/v1/forms/<id>/submissions` (`FormController::actionSubmissions`).

- **Response:** Array of `{ id, hashId, form_id, number, ip, created_at, updated_at, status, answers }`, paginated via `X-Pagination-*` response headers. Page size is locked server-side to the account's grid preference (~100) — the `per-page` query param is ignored, only `page` works.
- **Used by:** DocupletionForms node → Form Submission → List Submissions (walks every page when "Return All" is on); Tool node → List Submissions (single page, client-side `.slice(0, limit)`).

---

### GET /v1/&lt;tenantId&gt;/documents

Lists document sets (PDF template groupings, `fillable_pdf_id`) across the tenant's forms.

- **Response:** Array of `{ id, tenant_id, form_id, name, status, created_at, updated_at }`
- **Used by:** Document Set dropdown (`getDocumentSets` loadOptions); DocupletionForms node → Merged Document → List Document Sets; Tool node → List Document Sets; internally by the Template dropdown to resolve a document set's `form_id`.

### GET /v1/&lt;tenantId&gt;/documents/list?id=&lt;documentSetId&gt;

Lists every submission that has generated a merged PDF for a given document set, one entry per submission with a download URL.

- **Response:** Array of `{ id, name, tenant_id, form_id, submission_id, template_id, file_url, file_name, file_mimetype, file_size, submission: {...} }`
- **Used by:** DocupletionForms node → Merged Document → List Merged Documents; Tool node → List Merged Documents.

### GET /v1/&lt;tenantId&gt;/documents/download?id=&lt;documentSetId&gt;&template_id=&lt;templateId&gt;&submission_id=&lt;submissionId&gt;

Downloads the merged PDF for one document-set/template/submission combination as a raw binary file (not JSON) — `DocumentController::actionDownload` calls `sendFile()`. Depends on the backend's `stirling-pdf` service being up; a template with no real AcroForm fields will fail server-side (`No AcroForm present in document`).

- **Response:** Binary PDF. `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<name>.pdf"`.
- **Used by:** DocupletionForms node → Merged Document → Download Merged Document. Not exposed on the Tool node — its output contract is text/JSON only, no binary.

### POST /v1/&lt;tenantId&gt;/documents/webhooks

Registers a webhook that fires when a submission generates a merged PDF for the given document set. There is no "new form submitted" event independent of document merging, and deliveries are **not signed** — the backend never sends anything to verify a shared secret against.

- **Body:** `{ fillable_pdf_id: <documentSetId>, url: <webhookUrl>, content_type: 1 }` (`content_type`: `1` = JSON metadata only, `2` = file only, `3` = file + metadata — this package always sends `1`)
- **Response:** `{ id, tenant_id, fillable_pdf_id, form_id, status, url, content_type, created_at, updated_at }`
- **Used by:** DocupletionForms Trigger (create).

### DELETE /v1/&lt;tenantId&gt;/documents/webhooks/&lt;id&gt;

Deregisters a webhook.

- **Used by:** DocupletionForms Trigger (delete).

### Webhook delivery payload

What DocupletionForms actually POSTs to a registered webhook URL when a document merges (`modules/addons/modules/fillable_pdf/Module.php`):

```json
{
  "id": 1, "name": "...", "tenant_id": 1, "form_id": 15,
  "submission_id": 5, "template_id": "9",
  "file_url": "...", "file_name": "...", "file_mimetype": "application/pdf", "file_size": "123619",
  "submission": { "id": 5, "form_id": 15, "number": "...", "ip": "...", "created_at": "...", "updated_at": "...", "status": 1, "answers": { "...": "..." } }
}
```

- **Used by:** DocupletionForms Trigger's `webhook()` handler — "Include Submission Data" (default on) controls whether the `submission` object is stripped from the output.
