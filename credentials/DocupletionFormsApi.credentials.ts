import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class DocupletionFormsApi implements ICredentialType {
  name = 'docupletionFormsApi';

  displayName = 'DocupletionForms API';

  documentationUrl = 'https://docupletionforms.com/automations';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://app.docupletionforms.com/api',
      required: true,
      description: 'Base URL for the DocupletionForms API',
    },
  ];
}
