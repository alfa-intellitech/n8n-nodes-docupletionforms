import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import type {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  INodePropertyOptions,
} from 'n8n-workflow';
import { docupletionFormsApiRequest } from '../shared/GenericFunctions';

export class DocupletionForms implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DocupletionForms',
    name: 'docupletionForms',
    icon: 'file:docupletionforms.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description:
      'Interact with DocupletionForms — conditional logic forms with automated PDF document generation.',
    defaults: { name: 'DocupletionForms' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'docupletionFormsApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Form Submission', value: 'submission' },
          { name: 'Merged Document', value: 'document' },
        ],
        default: 'submission',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['submission'] } },
        options: [
          { name: 'Save & Edit Later', value: 'saveForLater' },
          { name: 'Prefill & Submit Later', value: 'prefillAndSubmitLater' },
        ],
        default: 'saveForLater',
      },
      {
        displayName: 'Form',
        name: 'formId',
        type: 'options',
        required: true,
        displayOptions: { show: { resource: ['submission'] } },
        description: 'The form to use',
        typeOptions: { loadOptionsMethod: 'getForms' },
        default: '',
      },
      // --- Save & Edit Later ---
      {
        displayName: 'Field Values',
        name: 'fieldValues',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        displayOptions: { show: { resource: ['submission'], operation: ['saveForLater'] } },
        description: 'Pre-populate specific form fields in the draft',
        default: {},
        options: [
          {
            name: 'field',
            displayName: 'Field',
            values: [
              {
                displayName: 'Field Name',
                name: 'key',
                type: 'string',
                default: '',
                description: 'The data name (slug) of the form field',
              },
              { displayName: 'Value', name: 'value', type: 'string', default: '' },
            ],
          },
        ],
      },
      {
        displayName: 'Additional Options',
        name: 'additionalOptions',
        type: 'collection',
        displayOptions: { show: { resource: ['submission'], operation: ['saveForLater'] } },
        default: {},
        placeholder: 'Add Option',
        options: [
          {
            displayName: 'Expiry (Hours)',
            name: 'expiryHours',
            type: 'number',
            default: 72,
            description: 'How many hours the draft edit link remains valid',
          },
          {
            displayName: 'Notify Email',
            name: 'notifyEmail',
            type: 'string',
            default: '',
            description: 'Email address to send the draft edit link to',
          },
        ],
      },
      // --- Prefill & Submit Later ---
      {
        displayName: 'Prefill Data',
        name: 'prefillData',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        displayOptions: { show: { resource: ['submission'], operation: ['prefillAndSubmitLater'] } },
        description: 'Field values to pre-populate when the respondent opens the form',
        default: {},
        options: [
          {
            name: 'field',
            displayName: 'Field',
            values: [
              {
                displayName: 'Field Name (slug)',
                name: 'key',
                type: 'string',
                default: '',
              },
              { displayName: 'Value', name: 'value', type: 'string', default: '' },
            ],
          },
        ],
      },
      {
        displayName: 'Additional Options',
        name: 'additionalOptions',
        type: 'collection',
        displayOptions: { show: { resource: ['submission'], operation: ['prefillAndSubmitLater'] } },
        default: {},
        placeholder: 'Add Option',
        options: [
          {
            displayName: 'Link Expiry (Hours)',
            name: 'expiryHours',
            type: 'number',
            default: 168,
            description: 'How many hours the prefilled link remains valid (default 7 days)',
          },
          {
            displayName: 'Lock Prefilled Fields',
            name: 'lockFields',
            type: 'boolean',
            default: false,
            description: 'Whether to make prefilled fields read-only',
          },
          {
            displayName: 'Redirect URL After Submit',
            name: 'redirectUrl',
            type: 'string',
            default: '',
            description: 'URL to redirect the respondent to after they submit the form',
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      async getForms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const forms = await docupletionFormsApiRequest.call(this, 'GET', '/forms');
          if (Array.isArray(forms) && forms.length > 0) {
            return forms.map((form: { id: string; name: string }) => ({
              name: form.name,
              value: form.id,
            }));
          }
        } catch (_) {
          // ignore
        }
        return [{ name: '— No forms found —', value: '' }];
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        if (resource === 'submission' && operation === 'saveForLater') {
          const formId = this.getNodeParameter('formId', i) as string;
          const fieldValues = this.getNodeParameter('fieldValues', i) as {
            field?: Array<{ key: string; value: string }>;
          };
          const additionalOptions = this.getNodeParameter('additionalOptions', i) as IDataObject;
          const fields: IDataObject = {};
          if (fieldValues?.field) {
            for (const f of fieldValues.field) {
              if (f.key) fields[f.key] = f.value;
            }
          }
          const body: IDataObject = {
            formId,
            fields,
            expiryHours: additionalOptions.expiryHours ?? 72,
          };
          if (additionalOptions.notifyEmail) {
            body.notifyEmail = additionalOptions.notifyEmail;
          }
          const result = await docupletionFormsApiRequest.call(this, 'POST', '/submissions/draft', body);
          returnData.push({ json: result as IDataObject });
        } else if (resource === 'submission' && operation === 'prefillAndSubmitLater') {
          const formId = this.getNodeParameter('formId', i) as string;
          const prefillData = this.getNodeParameter('prefillData', i) as {
            field?: Array<{ key: string; value: string }>;
          };
          const additionalOptions = this.getNodeParameter('additionalOptions', i) as IDataObject;
          const prefill: IDataObject = {};
          if (prefillData?.field) {
            for (const f of prefillData.field) {
              if (f.key) prefill[f.key] = f.value;
            }
          }
          const body: IDataObject = {
            formId,
            prefillData: prefill,
            expiryHours: additionalOptions.expiryHours ?? 168,
            lockFields: additionalOptions.lockFields ?? false,
          };
          if (additionalOptions.redirectUrl) {
            body.redirectUrl = additionalOptions.redirectUrl;
          }
          const result = await docupletionFormsApiRequest.call(
            this,
            'POST',
            '/submissions/prefill',
            body,
          );
          returnData.push({ json: result as IDataObject });
        } else {
          returnData.push({ json: { error: 'Unsupported resource/operation' } });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message } });
        } else {
          throw error;
        }
      }
    }

    return [returnData];
  }
}
