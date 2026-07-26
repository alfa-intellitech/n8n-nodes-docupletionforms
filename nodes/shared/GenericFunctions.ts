import type {
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
} from 'n8n-workflow';
import type {
  IDataObject,
  IHttpRequestMethods,
  INodeListSearchResult,
  INodePropertyOptions,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/**
 * Almost every DocupletionForms API route is scoped to a single tenant via
 * a `/v1/<tenantId>/...` URL segment (see modules/api/Module.php in the
 * backend), and the legacy (non-OAuth) auth method authenticates via an
 * `api_key` query parameter, not a header — there is no "Bearer <apiKey>"
 * or "X-API-Key" scheme on this API.
 *
 * `GET /forms/{id}/submissions` is the one exception in the route table —
 * it's registered as `api/v1/forms/<id>/submissions` (no tenant segment,
 * see FormController::actionSubmissions) — pass `scoped: false` for it.
 */
function buildUri(baseUrl: string, tenantId: string, endpoint: string, scoped = true): string {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return scoped ? `${cleanBase}/v1/${tenantId}${path}` : `${cleanBase}/v1${path}`;
}

function apiError(
  node: ConstructorParameters<typeof NodeApiError>[0],
  error: unknown,
): NodeApiError {
  const err = error as { message?: string; response?: { body?: unknown } };
  const message = err?.message || 'Request failed';
  const body = err?.response?.body;
  const description =
    body && typeof body === 'object' && 'message' in body
      ? String((body as { message?: unknown }).message)
      : body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: unknown }).error)
        : undefined;
  const errorResponse: JsonObject =
    body && typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as JsonObject)
      : { message: String((error as Error).message) };
  return new NodeApiError(node, errorResponse, {
    message,
    description: description ? String(description) : undefined,
  });
}

export async function docupletionFormsApiRequest(
  this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body: IDataObject = {},
  qs: IDataObject = {},
  scoped = true,
): Promise<unknown> {
  const credentials = await this.getCredentials('docupletionFormsApi');
  const uri = buildUri(
    (credentials.baseUrl as string) || 'https://app.docupletionforms.com/api',
    credentials.tenantId as string,
    endpoint,
    scoped,
  );

  const options = {
    method,
    uri,
    qs: { ...qs, api_key: credentials.apiKey as string },
    body: Object.keys(body).length ? body : undefined,
    json: true,
  };

  try {
    return await this.helpers.request(options);
  } catch (error: unknown) {
    throw apiError(this.getNode(), error);
  }
}

/**
 * The submissions/document-sets list endpoints return plain JSON arrays but
 * paginate via Yii's `X-Pagination-*` response headers (page size is locked
 * server-side to the account's grid preference, ~100 by default) — walks
 * every page and concatenates the results.
 */
export async function docupletionFormsApiRequestAllItems(
  this: IExecuteFunctions | ILoadOptionsFunctions,
  endpoint: string,
  qs: IDataObject = {},
  scoped = true,
): Promise<IDataObject[]> {
  const credentials = await this.getCredentials('docupletionFormsApi');
  const uri = buildUri(
    (credentials.baseUrl as string) || 'https://app.docupletionforms.com/api',
    credentials.tenantId as string,
    endpoint,
    scoped,
  );

  const results: IDataObject[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const options = {
      method: 'GET' as IHttpRequestMethods,
      uri,
      qs: { ...qs, api_key: credentials.apiKey as string, page },
      json: true,
      resolveWithFullResponse: true,
    };

    let response: { body: unknown; headers: Record<string, string> };
    try {
      response = await this.helpers.request(options);
    } catch (error: unknown) {
      throw apiError(this.getNode(), error);
    }

    const items = Array.isArray(response.body) ? (response.body as IDataObject[]) : [];
    results.push(...items);

    pageCount = parseInt(response.headers['x-pagination-page-count'] ?? '1', 10) || 1;
    if (items.length === 0) break;
    page += 1;
  } while (page <= pageCount);

  return results;
}

/**
 * Downloads a merged PDF (GET /documents/download) as a raw binary buffer.
 * This endpoint returns a file, not JSON, so it bypasses `json: true` /
 * automatic body parsing and reads the response headers to recover the
 * file name/content type the backend set via sendFile().
 */
export async function docupletionFormsApiRequestBinary(
  this: IExecuteFunctions,
  endpoint: string,
  qs: IDataObject = {},
): Promise<{ body: Buffer; headers: Record<string, string> }> {
  const credentials = await this.getCredentials('docupletionFormsApi');
  const uri = buildUri(
    (credentials.baseUrl as string) || 'https://app.docupletionforms.com/api',
    credentials.tenantId as string,
    endpoint,
  );

  const options = {
    method: 'GET' as IHttpRequestMethods,
    uri,
    qs: { ...qs, api_key: credentials.apiKey as string },
    encoding: null,
    resolveWithFullResponse: true,
  };

  try {
    const response = (await this.helpers.request(options)) as {
      body: Buffer;
      headers: Record<string, string>;
    };
    return { body: response.body, headers: response.headers };
  } catch (error: unknown) {
    throw apiError(this.getNode(), error);
  }
}

export async function loadDocupletionForms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const forms = await docupletionFormsApiRequest.call(this, 'GET', '/forms');
    if (Array.isArray(forms) && forms.length > 0) {
      return forms.map((form: { id: number | string; name: string }) => ({
        name: form.name,
        value: form.id,
      }));
    }
  } catch (_) {
    // ignore
  }

  return [{ name: '— No Forms Found —', value: '' }];
}

/**
 * A "document set" (`fillable_pdf_id` in the backend) is the container a
 * PDF template is uploaded into — the unit the merged-document endpoints
 * (`/documents/list`, `/documents/download`, `/documents/webhooks`) key off
 * of. It is not the same ID as a form.
 */
export async function loadDocupletionDocumentSets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  try {
    const documentSets = await docupletionFormsApiRequest.call(this, 'GET', '/documents');
    if (Array.isArray(documentSets) && documentSets.length > 0) {
      return documentSets.map((doc: { id: number | string; name: string; form_id?: number | string }) => ({
        name: doc.form_id !== undefined ? `${doc.name} (form ${doc.form_id})` : doc.name,
        value: doc.id,
      }));
    }
  } catch (_) {
    // ignore
  }

  return [{ name: '— No Document Sets Found —', value: '' }];
}

/**
 * Templates are listed per-form (`GET /forms/{form_id}/templates`, see
 * TemplateController::actionIndex) but Download Merged Document is scoped
 * by document set, not form — looks up the selected document set's
 * `form_id` first, then filters that form's templates down to the ones
 * belonging to it (`fillable_pdf_id`).
 */
export async function loadDocupletionTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const documentSetId = this.getCurrentNodeParameter('documentSetId', { extractValue: true }) as
    | number
    | string
    | undefined;
  if (!documentSetId) {
    return [{ name: '— Select a Document Set First —', value: '' }];
  }

  try {
    const documentSets = (await docupletionFormsApiRequest.call(this, 'GET', '/documents')) as Array<{
      id: number | string;
      form_id: number | string;
    }>;
    const documentSet = documentSets.find((doc) => String(doc.id) === String(documentSetId));
    if (!documentSet) {
      return [{ name: '— No Templates Found —', value: '' }];
    }

    const templates = (await docupletionFormsApiRequest.call(
      this,
      'GET',
      `/forms/${documentSet.form_id}/templates`,
    )) as Array<{ id: number | string; fillable_pdf_id: number | string; name?: string; original_filename?: string }>;
    const filtered = templates.filter((t) => String(t.fillable_pdf_id) === String(documentSetId));
    if (filtered.length > 0) {
      return filtered.map((t) => ({
        name: t.name || t.original_filename || `Template ${t.id}`,
        value: t.id,
      }));
    }
  } catch (_) {
    // ignore
  }

  return [{ name: '— No Templates Found —', value: '' }];
}

/**
 * Adapts the `loadOptions`-shaped helpers above into `listSearch`-shaped
 * results for `resourceLocator` fields (the "From List" tab). Filtering is
 * done client-side since none of these endpoints support a server-side
 * search/name filter — result sets here are small (forms/document sets/
 * templates per tenant), so this is cheap.
 */
function toListSearchResult(options: INodePropertyOptions[], filter?: string): INodeListSearchResult {
  const results = options
    .filter((option) => option.value !== '')
    .filter((option) => !filter || option.name.toLowerCase().includes(filter.toLowerCase()))
    .map((option) => ({ name: option.name, value: option.value as string | number }));
  return { results };
}

export async function searchDocupletionForms(
  this: ILoadOptionsFunctions,
  filter?: string,
): Promise<INodeListSearchResult> {
  return toListSearchResult(await loadDocupletionForms.call(this), filter);
}

export async function searchDocupletionDocumentSets(
  this: ILoadOptionsFunctions,
  filter?: string,
): Promise<INodeListSearchResult> {
  return toListSearchResult(await loadDocupletionDocumentSets.call(this), filter);
}

export async function searchDocupletionTemplates(
  this: ILoadOptionsFunctions,
  filter?: string,
): Promise<INodeListSearchResult> {
  return toListSearchResult(await loadDocupletionTemplates.call(this), filter);
}
