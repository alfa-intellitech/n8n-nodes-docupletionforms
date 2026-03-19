# DocupletionForms API (used by this package)

This document lists every DocupletionForms API endpoint used by `n8n-nodes-docupletionforms`. Keep it in sync when endpoints or payloads change.

Reference: [DocupletionForms API](https://documenter.getpostman.com/view/620818/SzzobG3R)

---

## Authentication

- **Header:** `Authorization: Bearer <API_KEY>`
- **Content-Type:** `application/json`

---

## Endpoints

### GET /forms

Returns the list of forms for the authenticated account.

- **Response:** Array of `{ id, name, ... }`
- **Used by:** Form dropdown (loadOptions) in all nodes

---

### POST /webhooks

Register a webhook.

- **Body:** `{ url, event, formId?, secret? }`
- **Response:** `{ id }` or similar (webhook identifier)
- **Used by:** DocupletionForms Trigger (create)

---

### DELETE /webhooks/:id

Remove a webhook.

- **Used by:** DocupletionForms Trigger (delete)

---

### POST /submissions/draft

Create a draft submission (Save & Edit Later).

- **Body:** `{ formId, fields, expiryHours?, notifyEmail? }`
- **Response:** `{ draftId, editUrl, expiresAt, formId }`
- **Used by:** DocupletionForms node (Save & Edit Later), Tool node (saveDraft)

---

### POST /submissions/prefill

Create a prefill link (Prefill & Submit Later).

- **Body:** `{ formId, prefillData, expiryHours?, lockFields?, redirectUrl? }`
- **Response:** `{ prefillId, prefillUrl, expiresAt, formId, lockedFields? }`
- **Used by:** DocupletionForms node (Prefill & Submit Later), Tool node (prefillLink)

---

### GET /submissions/:submissionId

Retrieve a submission by ID.

- **Response:** Submission object with field data
- **Used by:** Tool node (getSubmission)

---

### GET /submissions/:submissionId/document

Retrieve the merged PDF document URL for a submission.

- **Response:** Document metadata including URL
- **Used by:** Tool node (getMergedDocument)

---

### GET /forms/:formId/submissions

List submissions for a form.

- **Query:** `limit?`, `since?` (ISO 8601)
- **Response:** Array of submissions
- **Used by:** Tool node (listSubmissions)
