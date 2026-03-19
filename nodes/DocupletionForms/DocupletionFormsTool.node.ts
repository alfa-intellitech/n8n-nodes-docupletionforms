import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import type {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  INodePropertyOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { docupletionFormsApiRequest } from '../shared/GenericFunctions';

const TOOL_DESCRIPTIONS: Record<string, string> = {
  saveDraft:
    'Creates a draft/partial form submission at DocupletionForms with pre-populated field data. Use this when a human needs to review and complete a form later. Returns a direct edit URL.',
  prefillLink:
    'Generates a pre-filled form URL that can be shared with a person so they can review pre-populated data and submit the form. Returns a shareable link with an optional expiry.',
  getSubmission: 'Retrieves the full field data for a specific form submission using its submission ID.',
  getMergedDocument:
    'Gets the download URL for the merged/generated PDF document associated with a form submission.',
  listSubmissions:
    'Lists recent form submissions for a specified form. Returns submission IDs, timestamps, and field summaries.',
};

export class DocupletionFormsTool implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DocupletionForms',
    name: 'docupletionFormsTool',
    icon: 'file:docupletionforms.svg',
    group: ['transform'],
    version: 1,
    subtitle:
      '={{$parameter["tool"] === "saveDraft" ? "Save Draft from Docupletion Forms" : $parameter["tool"] === "prefillLink" ? "Prefill Form Link from Docupletion Forms" : $parameter["tool"] === "getSubmission" ? "Get Submission from Docupletion Forms" : $parameter["tool"] === "getMergedDocument" ? "Get Merged Document URL from Docupletion Forms" : $parameter["tool"] === "listSubmissions" ? "List Recent Submissions from Docupletion Forms" : "Docupletion Forms Tool"}}',
    description:
      'Use DocupletionForms as an AI agent tool — save drafts, prefill forms, retrieve submissions, and trigger document merges.',
    defaults: { name: 'DocupletionForms' },
    codex: {
      categories: ['AI'],
      subcategories: { AI: ['Tools'] },
      resources: {
        primaryDocumentation: [{ url: 'https://docupletionforms.com/automations' }],
      },
    },
    usableAsTool: true,
    // This node is executed as a tool by the AI Agent ("Tools Agent").
    // `ai_tool` is the special connection type used for structured tool invocation.
    inputs: [{ type: NodeConnectionTypes.AiTool }],
    outputs: [NodeConnectionTypes.AiTool],
    credentials: [{ name: 'docupletionFormsApi', required: true }],
    properties: [
      {
        displayName: 'Tool Description Mode',
        name: 'descriptionType',
        type: 'options',
        options: [
          { name: 'Set Automatically', value: 'auto' },
          { name: 'Set Manually', value: 'manual' },
        ],
        default: 'auto',
        description: 'Controls how the AI Agent tool description is generated.',
      },
      {
        displayName: 'Tool Description',
        name: 'toolDescription',
        type: 'string',
        default:
          'Use DocupletionForms as an AI agent tool — save drafts, prefill forms, retrieve submissions, and trigger document merges.',
        typeOptions: { rows: 4 },
        displayOptions: { show: { descriptionType: ['manual'] } },
        description: 'Shown to the AI Agent to decide when and how to use this tool.',
      },
      {
        displayName: 'Tool',
        name: 'tool',
        type: 'options',
        options: [
          {
            name: 'Save Draft (Save & Edit Later)',
            value: 'saveDraft',
            description: TOOL_DESCRIPTIONS.saveDraft,
          },
          {
            name: 'Prefill Form Link (Prefill & Submit Later)',
            value: 'prefillLink',
            description: TOOL_DESCRIPTIONS.prefillLink,
          },
          {
            name: 'Get Submission',
            value: 'getSubmission',
            description: TOOL_DESCRIPTIONS.getSubmission,
          },
          {
            name: 'Get Merged Document URL',
            value: 'getMergedDocument',
            description: TOOL_DESCRIPTIONS.getMergedDocument,
          },
          {
            name: 'List Recent Submissions',
            value: 'listSubmissions',
            description: TOOL_DESCRIPTIONS.listSubmissions,
          },
        ],
        // Keep this as a real dropdown selection for manual configuration.
        // In the AI Agent workflow, the AI will provide the operation inputs, while `tool` itself stays fixed.
        default: 'prefillLink',
      },
      // saveDraft params
      {
        displayName: 'Form',
        name: 'formId',
        type: 'options',
        required: true,
        displayOptions: { show: { tool: ['saveDraft', 'prefillLink', 'listSubmissions'] } },
        typeOptions: { loadOptionsMethod: 'getForms' },
        default: '',
      },
      {
        displayName: 'Fields (JSON object)',
        name: 'fieldsJson',
        type: 'json',
        default: '{}',
        required: true,
        displayOptions: { show: { tool: ['saveDraft'] } },
        description: 'JSON object of field slugs to values, e.g. {"field_name":"John","field_email":"john@example.com"}',
      },
      {
        displayName: 'Notify Email',
        name: 'notifyEmail',
        type: 'string',
        default: '',
        displayOptions: { show: { tool: ['saveDraft'] } },
      },
      {
        displayName: 'Expiry (Hours)',
        name: 'expiryHours',
        type: 'number',
        default: 72,
        displayOptions: { show: { tool: ['saveDraft'] } },
      },
      // prefillLink params
      {
        displayName: 'Prefill Data (JSON object)',
        name: 'prefillDataJson',
        type: 'json',
        default: '{}',
        required: true,
        displayOptions: { show: { tool: ['prefillLink'] } },
        description: 'JSON object of field slugs to values',
      },
      {
        displayName: 'Lock Fields',
        name: 'lockFields',
        type: 'boolean',
        default: false,
        displayOptions: { show: { tool: ['prefillLink'] } },
      },
      {
        displayName: 'Expiry (Hours)',
        name: 'expiryHours',
        type: 'number',
        default: 168,
        displayOptions: { show: { tool: ['prefillLink'] } },
      },
      // getSubmission / getMergedDocument
      {
        displayName: 'Submission ID',
        name: 'submissionId',
        type: 'string',
        required: true,
        displayOptions: { show: { tool: ['getSubmission', 'getMergedDocument'] } },
        default: '',
      },
      // listSubmissions
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 20,
        displayOptions: { show: { tool: ['listSubmissions'] } },
      },
      {
        displayName: 'Since (ISO 8601)',
        name: 'since',
        type: 'string',
        default: '',
        displayOptions: { show: { tool: ['listSubmissions'] } },
        description: 'Only return submissions after this time',
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
    const tool = this.getNodeParameter('tool', 0) as string;
    let result: unknown;

    try {
      if (tool === 'saveDraft') {
        const formId = this.getNodeParameter('formId', 0) as string;
        let fields: IDataObject = {};
        const fieldsJsonValue = this.getNodeParameter('fieldsJson', 0) as unknown;
        if (typeof fieldsJsonValue === 'string') {
          try {
            fields = JSON.parse(fieldsJsonValue || '{}') as IDataObject;
          } catch (_) {
            fields = {};
          }
        } else if (Array.isArray(fieldsJsonValue)) {
          // $fromAI('fieldsJson', 'json', [{}]) uses an array default; take the first element.
          const first = fieldsJsonValue[0];
          fields = first && typeof first === 'object' && !Array.isArray(first) ? (first as IDataObject) : {};
        } else if (fieldsJsonValue && typeof fieldsJsonValue === 'object') {
          fields = fieldsJsonValue as IDataObject;
        }
        const notifyEmail = this.getNodeParameter('notifyEmail', 0) as string;
        const expiryHours = this.getNodeParameter('expiryHours', 0) as number;
        result = await docupletionFormsApiRequest.call(this, 'POST', '/submissions/draft', {
          formId,
          fields,
          expiryHours: expiryHours || 72,
          ...(notifyEmail ? { notifyEmail } : {}),
        });
      } else if (tool === 'prefillLink') {
        const formId = this.getNodeParameter('formId', 0) as string;
        let prefillData: IDataObject = {};
        const prefillDataJsonValue = this.getNodeParameter('prefillDataJson', 0) as unknown;
        if (typeof prefillDataJsonValue === 'string') {
          try {
            prefillData = JSON.parse(prefillDataJsonValue || '{}') as IDataObject;
          } catch (_) {
            prefillData = {};
          }
        } else if (Array.isArray(prefillDataJsonValue)) {
          // $fromAI('prefillDataJson', 'json', [{}]) uses an array default; take the first element.
          const first = prefillDataJsonValue[0];
          prefillData =
            first && typeof first === 'object' && !Array.isArray(first) ? (first as IDataObject) : {};
        } else if (prefillDataJsonValue && typeof prefillDataJsonValue === 'object') {
          prefillData = prefillDataJsonValue as IDataObject;
        }
        const lockFields = this.getNodeParameter('lockFields', 0) as boolean;
        const expiryHours = this.getNodeParameter('expiryHours', 0) as number;
        result = await docupletionFormsApiRequest.call(this, 'POST', '/submissions/prefill', {
          formId,
          prefillData,
          lockFields: lockFields ?? false,
          expiryHours: expiryHours || 168,
        });
      } else if (tool === 'getSubmission') {
        const submissionId = this.getNodeParameter('submissionId', 0) as string;
        result = await docupletionFormsApiRequest.call(this, 'GET', `/submissions/${submissionId}`);
      } else if (tool === 'getMergedDocument') {
        const submissionId = this.getNodeParameter('submissionId', 0) as string;
        result = await docupletionFormsApiRequest.call(
          this,
          'GET',
          `/submissions/${submissionId}/document`,
        );
      } else if (tool === 'listSubmissions') {
        const formId = this.getNodeParameter('formId', 0) as string;
        const limit = this.getNodeParameter('limit', 0) as number;
        const since = this.getNodeParameter('since', 0) as string;
        const qs: IDataObject = {};
        if (limit) qs.limit = limit;
        if (since) qs.since = since;
        result = await docupletionFormsApiRequest.call(
          this,
          'GET',
          `/forms/${formId}/submissions`,
          {},
          qs,
        );
      } else {
        result = { error: 'Unknown tool' };
      }
    } catch (error: unknown) {
      result = { error: (error as Error).message };
    }

    const output = typeof result === 'string' ? result : JSON.stringify(result);
    return [[{ json: { response: output } }]];
  }
}
