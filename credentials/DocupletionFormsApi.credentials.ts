import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class DocupletionFormsApi implements ICredentialType {
  name = 'docupletionFormsApi';

  displayName = 'DocupletionForms API';

  documentationUrl =
    'https://documenter.getpostman.com/view/620818/SzzobG3R#ddcc3c78-cc33-49a8-af30-20bdd124cdc0';

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
}
