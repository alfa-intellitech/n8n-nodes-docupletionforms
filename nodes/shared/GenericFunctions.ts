import type {
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
} from 'n8n-workflow';
import type { IDataObject, IHttpRequestMethods, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export async function docupletionFormsApiRequest(
  this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body: IDataObject = {},
  qs: IDataObject = {},
): Promise<unknown> {
  const credentials = await this.getCredentials('docupletionFormsApi');
  const baseUrl = (credentials.baseUrl as string) || 'https://app.docupletionforms.com/api';
  const uri = `${baseUrl.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${credentials.apiKey as string}`,
      'Content-Type': 'application/json',
    },
    uri,
    qs: Object.keys(qs).length ? qs : undefined,
    body: Object.keys(body).length ? body : undefined,
    json: true,
  };

  try {
    return await this.helpers.request(options);
  } catch (error: unknown) {
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
    throw new NodeApiError(this.getNode(), errorResponse, {
      message,
      description: description ? String(description) : undefined,
    });
  }
}
