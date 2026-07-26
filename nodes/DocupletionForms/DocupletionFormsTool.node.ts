import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import type {
  IDataObject,
  INodeExecutionData,
  INodeListSearchResult,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
  docupletionFormsApiRequest,
  searchDocupletionDocumentSets,
  searchDocupletionForms,
} from '../shared/GenericFunctions';

function pickFields(input: unknown, selectedFields: string[]): unknown {
  if (!selectedFields.length) return input;
  if (Array.isArray(input)) return input.map((item) => pickFields(item, selectedFields));
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const field of selectedFields) {
      if (record[field] !== undefined) filtered[field] = record[field];
    }
    return filtered;
  }
  return input;
}

function simplifyPayload(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => simplifyPayload(item));
  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).slice(0, 10);
    return Object.fromEntries(entries);
  }
  return input;
}

function parseJsonParam(value: unknown): IDataObject {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value || '{}') as IDataObject;
    } catch (_) {
      return {};
    }
  }
  if (Array.isArray(value)) {
    // $fromAI(..., 'json', [{}]) uses an array default; take the first element.
    const first = value[0];
    return first && typeof first === 'object' && !Array.isArray(first) ? (first as IDataObject) : {};
  }
  if (value && typeof value === 'object') return value as IDataObject;
  return {};
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  submitForm:
    'Submits a DocupletionForms form with the given field data and returns a link the respondent can use to come back and edit their answers later. Use this when a human needs to review/complete a form later.',
  prefillLink:
    'Generates a pre-filled form URL that can be shared with a person so they can review pre-populated data and submit the form themselves. Nothing is saved until they submit it.',
  listSubmissions:
    'Lists submissions received for a given form, newest first, including each submission\'s ID and field answers. Use this to check whether/how a form has already been filled out.',
  listDocumentSets:
    'Lists the PDF document sets (template groupings) configured across the tenant, each with its ID, name, and the form it belongs to.',
  listMergedDocuments:
    'Lists every submission that has generated a merged PDF for a given document set, including a download URL per generated file.',
};

export class DocupletionFormsTool implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DocupletionForms Tool',
    name: 'docupletionFormsTool',
    icon: 'file:docupletionforms.svg',
    group: ['transform'],
    version: 1,
    subtitle:
      '={{$parameter["tool"] === "submitForm" ? "Submit Form from Docupletion Forms" : $parameter["tool"] === "prefillLink" ? "Prefill Form Link from Docupletion Forms" : $parameter["tool"] === "listSubmissions" ? "List Submissions from Docupletion Forms" : $parameter["tool"] === "listDocumentSets" ? "List Document Sets from Docupletion Forms" : $parameter["tool"] === "listMergedDocuments" ? "List Merged Documents from Docupletion Forms" : "Docupletion Forms Tool"}}',
    description:
      'Use DocupletionForms as an AI agent tool — submit forms, generate prefill links, look up submissions, and look up merged documents.',
    defaults: { name: 'DocupletionForms Tool' },
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
        description: 'Controls how the AI Agent tool description is generated',
      },
      {
        displayName: 'Tool Description',
        name: 'toolDescription',
        type: 'string',
        default:
          'Use DocupletionForms as an AI agent tool — submit forms, generate prefill links, look up submissions, and look up merged documents.',
        typeOptions: { rows: 4 },
        displayOptions: { show: { descriptionType: ['manual'] } },
        description: 'Shown to the AI Agent to decide when and how to use this tool',
      },
      {
        displayName: 'Output',
        name: 'outputMode',
        type: 'options',
        options: [
          { name: 'Simplified', value: 'simplified' },
          { name: 'Raw', value: 'raw' },
          { name: 'Selected Fields', value: 'selectedFields' },
        ],
        default: 'simplified',
        description:
          'Whether to return a simplified payload, raw payload, or only selected top-level fields',
      },
      {
        displayName: 'Selected Fields',
        name: 'selectedFields',
        type: 'multiOptions',
        options: [
          { name: 'Action', value: 'action' },
          { name: 'File Name', value: 'file_name' },
          { name: 'File URL', value: 'file_url' },
          { name: 'Form ID', value: 'form_id' },
          { name: 'ID', value: 'id' },
          { name: 'Message', value: 'message' },
          { name: 'Name', value: 'name' },
          { name: 'Submission ID', value: 'submission_id' },
          { name: 'Success', value: 'success' },
          { name: 'URL', value: 'url' },
        ],
        default: ['id'],
        displayOptions: { show: { outputMode: ['selectedFields'] } },
        description: 'Top-level fields to include in the output',
      },
      {
        displayName: 'Tool',
        name: 'tool',
        type: 'options',
        options: [
          {
            name: 'Submit Form',
            value: 'submitForm',
            description: TOOL_DESCRIPTIONS.submitForm,
          },
          {
            name: 'Prefill Form Link',
            value: 'prefillLink',
            description: TOOL_DESCRIPTIONS.prefillLink,
          },
          {
            name: 'List Submissions',
            value: 'listSubmissions',
            description: TOOL_DESCRIPTIONS.listSubmissions,
          },
          {
            name: 'List Document Sets',
            value: 'listDocumentSets',
            description: TOOL_DESCRIPTIONS.listDocumentSets,
          },
          {
            name: 'List Merged Documents',
            value: 'listMergedDocuments',
            description: TOOL_DESCRIPTIONS.listMergedDocuments,
          },
        ],
        default: 'prefillLink',
      },
      // submitForm / prefillLink / listSubmissions params
      {
        displayName: 'Form',
        name: 'formId',
        type: 'resourceLocator',
        description: 'The form to use',
        required: true,
        displayOptions: { show: { tool: ['submitForm', 'prefillLink', 'listSubmissions'] } },
        default: { mode: 'list', value: '' },
        modes: [
          {
            displayName: 'From List',
            name: 'list',
            type: 'list',
            typeOptions: { searchListMethod: 'searchForms', searchable: true },
          },
          {
            displayName: 'ID',
            name: 'id',
            type: 'string',
            placeholder: 'e.g. 12345',
            validation: [
              { type: 'regex', properties: { regex: '^[0-9]+$', errorMessage: 'Not a valid Form ID' } },
            ],
          },
        ],
      },
      {
        displayName: 'Fields (JSON Object)',
        name: 'fieldsJson',
        type: 'json',
        default: '{}',
        required: true,
        displayOptions: { show: { tool: ['submitForm'] } },
        description: 'JSON object of field slugs to values, e.g. {"field_name":"John","field_email":"john@example.com"}',
      },
      {
        displayName: 'Notify Email',
        name: 'notifyEmail',
        type: 'string',
        default: '',
        displayOptions: { show: { tool: ['submitForm'] } },
        description: 'Optional email address to send a copy of the edit link to',
      },
      // prefillLink params
      {
        displayName: 'Prefill Data (JSON Object)',
        name: 'prefillDataJson',
        type: 'json',
        default: '{}',
        required: true,
        displayOptions: { show: { tool: ['prefillLink'] } },
        description: 'JSON object of field slugs to values',
      },
      {
        displayName: 'Limit',
        name: 'submissionsLimit',
        type: 'number',
        typeOptions: { minValue: 1 },
        default: 20,
        displayOptions: { show: { tool: ['listSubmissions'] } },
        description: 'Max number of submissions to return (most recent first)',
      },
      // listMergedDocuments params
      {
        displayName: 'Document Set',
        name: 'documentSetId',
        type: 'resourceLocator',
        required: true,
        displayOptions: { show: { tool: ['listMergedDocuments'] } },
        description: 'The document set (PDF template grouping) to use',
        default: { mode: 'list', value: '' },
        modes: [
          {
            displayName: 'From List',
            name: 'list',
            type: 'list',
            typeOptions: { searchListMethod: 'searchDocumentSets', searchable: true },
          },
          {
            displayName: 'ID',
            name: 'id',
            type: 'string',
            placeholder: 'e.g. 12345',
            validation: [
              { type: 'regex', properties: { regex: '^[0-9]+$', errorMessage: 'Not a valid Document Set ID' } },
            ],
          },
        ],
      },
    ],
  };

  methods = {
    listSearch: {
      async searchForms(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
        return await searchDocupletionForms.call(this, filter);
      },
      async searchDocumentSets(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
        return await searchDocupletionDocumentSets.call(this, filter);
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const tool = this.getNodeParameter('tool', 0) as string;
    const outputMode = this.getNodeParameter('outputMode', 0) as string;
    const selectedFields = this.getNodeParameter('selectedFields', 0, []) as string[];
    let result: unknown;

    // Every branch below either calls docupletionFormsApiRequest (which
    // always throws a well-formed NodeApiError) or throws NodeOperationError
    // directly, so there's no raw error to catch/rewrap here.
    if (tool === 'submitForm') {
      const formId = this.getNodeParameter('formId', 0, undefined, { extractValue: true }) as string;
      const fields = parseJsonParam(this.getNodeParameter('fieldsJson', 0));
      const notifyEmail = this.getNodeParameter('notifyEmail', 0) as string;
      // The backend reads the field map directly off the POST body (no
      // wrapping key) — see FormController::actionSubmit.
      result = await docupletionFormsApiRequest.call(this, 'POST', `/forms/${formId}/submit`, {
        ...fields,
        ...(notifyEmail ? { email_address: notifyEmail } : {}),
      });
    } else if (tool === 'prefillLink') {
      const formId = this.getNodeParameter('formId', 0, undefined, { extractValue: true }) as string;
      const prefillData = parseJsonParam(this.getNodeParameter('prefillDataJson', 0));
      result = await docupletionFormsApiRequest.call(this, 'POST', `/forms/${formId}/prefill`, prefillData);
    } else if (tool === 'listSubmissions') {
      const formId = this.getNodeParameter('formId', 0, undefined, { extractValue: true }) as string;
      const limit = this.getNodeParameter('submissionsLimit', 0) as number;
      const submissions = await docupletionFormsApiRequest.call(this, 'GET', `/forms/${formId}/submissions`, {}, {}, false);
      result = Array.isArray(submissions) ? submissions.slice(0, limit) : submissions;
    } else if (tool === 'listDocumentSets') {
      result = await docupletionFormsApiRequest.call(this, 'GET', '/documents');
    } else if (tool === 'listMergedDocuments') {
      const documentSetId = this.getNodeParameter('documentSetId', 0, undefined, { extractValue: true }) as string;
      result = await docupletionFormsApiRequest.call(this, 'GET', '/documents/list', {}, { id: documentSetId });
    } else {
      throw new NodeOperationError(this.getNode(), `Unsupported tool: ${tool}`);
    }

    const shapedResult =
      outputMode === 'raw'
        ? result
        : outputMode === 'selectedFields'
          ? pickFields(result, selectedFields)
          : simplifyPayload(result);
    const output = typeof shapedResult === 'string' ? shapedResult : JSON.stringify(shapedResult);
    return [[{ json: { response: output }, pairedItem: { item: 0 } }]];
  }
}
