import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from 'n8n-workflow';

export class DocupletionFormsApi implements ICredentialType {
  name = 'docupletionFormsApi';

  displayName = 'DocupletionForms API';

  icon: Icon = 'file:../nodes/DocupletionForms/docupletionforms.svg';

  documentationUrl = 'https://github.com/alfa-intellitech/n8n-nodes-docupletionforms#readme';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Your DocupletionForms user access token (Manage Account &gt; API)',
    },
    {
      displayName: 'Tenant ID',
      name: 'tenantId',
      type: 'string',
      default: '',
      required: true,
      description:
        'The numeric organization/tenant ID this API key belongs to. Every DocupletionForms API route is scoped to a single tenant — find it in the app URL or on the Manage Account page.',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://app.docupletionforms.com/api',
      required: true,
      description: 'Base URL for the DocupletionForms API (without the /v1/&lt;tenant&gt; suffix)',
    },
  ];

  // The legacy (non-OAuth) auth method is an `api_key` query parameter —
  // applied here so every request made via httpRequestWithAuthentication
  // gets it automatically, merged into the request's other qs params.
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      qs: {
        api_key: '={{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '=/v1/{{$credentials.tenantId}}/forms',
    },
  };
}
