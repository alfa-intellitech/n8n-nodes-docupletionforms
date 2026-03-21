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
