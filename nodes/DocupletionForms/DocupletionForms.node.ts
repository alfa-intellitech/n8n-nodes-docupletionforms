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
  docupletionFormsApiRequestAllItems,
  docupletionFormsApiRequestBinary,
  searchDocupletionDocumentSets,
  searchDocupletionForms,
  searchDocupletionTemplates,
} from '../shared/GenericFunctions';

/** Backend sends `Content-Disposition: inline; filename="foo.pdf"` (see DocumentController::actionDownload's sendFile call). */
function fileNameFromContentDisposition(headers: Record<string, string>): string | undefined {
  const header = headers['content-disposition'];
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1];
}

/** Simplified field set for List Submissions — most-useful-first, under the 10-field UX guideline threshold. */
function simplifySubmission(item: IDataObject): IDataObject {
  const { id, form_id, number, status, created_at, updated_at, answers } = item;
  return { id, form_id, number, status, created_at, updated_at, answers };
}

/** Simplified field set for List Merged Documents — drops tenant_id and the bulky nested submission object. */
function simplifyMergedDocument(item: IDataObject): IDataObject {
  const { id, name, form_id, submission_id, template_id, file_url, file_name, file_mimetype, file_size } = item;
  return { id, name, form_id, submission_id, template_id, file_url, file_name, file_mimetype, file_size };
}

export class DocupletionForms implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DocupletionForms',
    name: 'docupletionForms',
    icon: 'file:docupletionforms.svg',
    group: ['transform'],
    version: 1,
    subtitle:
      '={{($parameter["resource"] === "document" ? $parameter["documentOperation"] : $parameter["operation"]) + ": " + $parameter["resource"]}}',
    description:
      'Interact with DocupletionForms — conditional logic forms with automated PDF document generation.',
    defaults: { name: 'DocupletionForms' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
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
      // --- Form Submission ---
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['submission'] } },
        options: [
          {
            name: 'Submit Form',
            value: 'saveForLater',
            action: 'Submit a form and get a link to edit it later',
            description:
              'Creates (or, with an existing submission ID, updates) a submission and returns a link the respondent can use to come back and edit it',
          },
          {
            name: 'Generate Prefilled Link',
            value: 'prefillAndSubmitLater',
            action: 'Generate a prefilled form link',
            description: 'Builds a URL to the public form with the given fields pre-populated. Nothing is saved until the respondent submits it themselves.',
          },
          {
            name: 'List Submissions',
            value: 'listSubmissions',
            action: 'List submissions for a form',
            description: 'Lists submissions received for a given form, newest first',
          },
        ],
        default: 'saveForLater',
      },
      {
        displayName: 'Form',
        name: 'formId',
        type: 'resourceLocator',
        required: true,
        displayOptions: { show: { resource: ['submission'] } },
        description: 'The form to use',
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
        displayName: 'Field Values',
        name: 'fieldValues',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        displayOptions: { show: { resource: ['submission'], operation: ['saveForLater', 'prefillAndSubmitLater'] } },
        description: 'Field slug/value pairs to submit or pre-populate, e.g. field_name = John',
        default: {},
        options: [
          {
            name: 'field',
            displayName: 'Field',
            values: [
              {
                displayName: 'Field Name (Slug)',
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
        displayOptions: { show: { resource: ['submission'], operation: ['saveForLater', 'prefillAndSubmitLater'] } },
        default: {},
        placeholder: 'Add Option',
        description: 'DocupletionForms has no separate link-expiry setting — sending a notify email is handled server-side by the same submit/prefill call',
        options: [
          {
            displayName: 'Notify Email',
            name: 'notifyEmail',
            type: 'string',
            default: '',
            description: 'Email address to send a copy of the link to',
          },
          {
            displayName: 'Notify Email Subject',
            name: 'notifyEmailSubject',
            type: 'string',
            default: '',
          },
          {
            displayName: 'Notify Email Message',
            name: 'notifyEmailMessage',
            type: 'string',
            typeOptions: { rows: 3 },
            default: '',
          },
        ],
      },
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        displayOptions: { show: { resource: ['submission'], operation: ['listSubmissions'] } },
        default: true,
        description: 'Whether to return all results or only up to a given limit',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: { minValue: 1 },
        displayOptions: { show: { resource: ['submission'], operation: ['listSubmissions'], returnAll: [false] } },
        default: 50,
        description: 'Max number of results to return',
      },
      {
        displayName: 'Simplify',
        name: 'simplify',
        type: 'boolean',
        displayOptions: { show: { resource: ['submission'], operation: ['listSubmissions'] } },
        default: true,
        description: 'Whether to return a simplified version of the response instead of the raw data',
      },
      // --- Merged Document ---
      {
        displayName: 'Operation',
        name: 'documentOperation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['document'] } },
        options: [
          {
            name: 'List Document Sets',
            value: 'listDocumentSets',
            action: 'List document sets for the tenant',
            description: 'Lists the PDF document sets (template groupings) configured across the tenant\'s forms',
          },
          {
            name: 'List Merged Documents',
            value: 'listMergedDocuments',
            action: 'List merged documents for a document set',
            description: 'Lists every submission that has generated a merged PDF for a given document set, with a download URL per file',
          },
          {
            name: 'Download Merged Document',
            value: 'downloadMergedDocument',
            action: 'Download a merged document',
            description: 'Downloads the merged PDF for a specific document-set/template/submission combination as binary data',
          },
        ],
        default: 'listDocumentSets',
      },
      {
        displayName: 'Document Set',
        name: 'documentSetId',
        type: 'resourceLocator',
        required: true,
        displayOptions: { show: { resource: ['document'], documentOperation: ['listMergedDocuments', 'downloadMergedDocument'] } },
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
      {
        displayName: 'Simplify',
        name: 'simplify',
        type: 'boolean',
        displayOptions: { show: { resource: ['document'], documentOperation: ['listMergedDocuments'] } },
        default: true,
        description: 'Whether to return a simplified version of the response instead of the raw data',
      },
      {
        displayName: 'Template',
        name: 'templateId',
        type: 'resourceLocator',
        required: true,
        displayOptions: { show: { resource: ['document'], documentOperation: ['downloadMergedDocument'] } },
        description: 'The template within the document set to render',
        default: { mode: 'list', value: '' },
        modes: [
          {
            displayName: 'From List',
            name: 'list',
            type: 'list',
            typeOptions: { searchListMethod: 'searchTemplates', searchable: true },
          },
          {
            displayName: 'ID',
            name: 'id',
            type: 'string',
            placeholder: 'e.g. 12345',
            validation: [
              { type: 'regex', properties: { regex: '^[0-9]+$', errorMessage: 'Not a valid Template ID' } },
            ],
          },
        ],
      },
      {
        displayName: 'Submission ID',
        name: 'submissionId',
        type: 'string',
        required: true,
        displayOptions: { show: { resource: ['document'], documentOperation: ['downloadMergedDocument'] } },
        default: '',
        description: 'The submission to render — see the "submission_id" field returned by List Merged Documents',
      },
      {
        displayName: 'Put Output File in Field',
        name: 'binaryPropertyName',
        type: 'string',
        displayOptions: { show: { resource: ['document'], documentOperation: ['downloadMergedDocument'] } },
        default: 'data',
        description: 'The name of the output binary field to put the downloaded PDF in',
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
      async searchTemplates(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
        return await searchDocupletionTemplates.call(this, filter);
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const resource = this.getNodeParameter('resource', 0) as string;
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        if (resource === 'submission') {
          const operation = this.getNodeParameter('operation', i) as string;
          const formId = this.getNodeParameter('formId', i, undefined, { extractValue: true }) as string;

          if (operation === 'listSubmissions') {
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const simplify = this.getNodeParameter('simplify', i) as boolean;
            const allItems = await docupletionFormsApiRequestAllItems.call(this, `/forms/${formId}/submissions`, {}, false);
            const limitedItems = returnAll
              ? allItems
              : allItems.slice(0, this.getNodeParameter('limit', i) as number);
            for (const entry of limitedItems) {
              returnData.push({ json: simplify ? simplifySubmission(entry) : entry, pairedItem: { item: i } });
            }
            continue;
          }

          const fieldValues = this.getNodeParameter('fieldValues', i) as {
            field?: Array<{ key: string; value: string }>;
          };
          const additionalOptions = this.getNodeParameter('additionalOptions', i) as IDataObject;

          // The backend reads the field map directly off the POST body
          // (no wrapping key) — see FormController::actionSubmit/actionPrefill,
          // which call Yii::$app->request->post() as the submission data.
          const body: IDataObject = {};
          if (fieldValues?.field) {
            for (const f of fieldValues.field) {
              if (f.key) body[f.key] = f.value;
            }
          }
          if (additionalOptions.notifyEmail) {
            body.email_address = additionalOptions.notifyEmail;
            if (additionalOptions.notifyEmailSubject) body.email_subject = additionalOptions.notifyEmailSubject;
            if (additionalOptions.notifyEmailMessage) body.email_message = additionalOptions.notifyEmailMessage;
          }

          const endpoint =
            operation === 'saveForLater' ? `/forms/${formId}/submit` : `/forms/${formId}/prefill`;
          const result = await docupletionFormsApiRequest.call(this, 'POST', endpoint, body);
          returnData.push({ json: result as IDataObject, pairedItem: { item: i } });
        } else if (resource === 'document') {
          const documentOperation = this.getNodeParameter('documentOperation', i) as string;
          if (documentOperation === 'listDocumentSets') {
            const result = await docupletionFormsApiRequest.call(this, 'GET', '/documents');
            const list = Array.isArray(result) ? result : [result];
            for (const entry of list) returnData.push({ json: entry as IDataObject, pairedItem: { item: i } });
          } else if (documentOperation === 'listMergedDocuments') {
            const documentSetId = this.getNodeParameter('documentSetId', i, undefined, { extractValue: true }) as string;
            const simplify = this.getNodeParameter('simplify', i) as boolean;
            const result = await docupletionFormsApiRequest.call(this, 'GET', '/documents/list', {}, { id: documentSetId });
            const list = Array.isArray(result) ? result : [result];
            for (const entry of list) {
              returnData.push({
                json: simplify ? simplifyMergedDocument(entry as IDataObject) : (entry as IDataObject),
                pairedItem: { item: i },
              });
            }
          } else if (documentOperation === 'downloadMergedDocument') {
            const documentSetId = this.getNodeParameter('documentSetId', i, undefined, { extractValue: true }) as string;
            const templateId = this.getNodeParameter('templateId', i, undefined, { extractValue: true }) as string;
            const submissionId = this.getNodeParameter('submissionId', i) as string;
            const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;

            const { body, headers } = await docupletionFormsApiRequestBinary.call(this, '/documents/download', {
              id: documentSetId,
              template_id: templateId,
              submission_id: submissionId,
            });
            const fileName = fileNameFromContentDisposition(headers) ?? `document-${submissionId}.pdf`;
            const mimeType = headers['content-type'] ?? 'application/pdf';
            const binaryData = await this.helpers.prepareBinaryData(body, fileName, mimeType);
            returnData.push({
              json: { fileName, mimeType, documentSetId, templateId, submissionId },
              binary: { [binaryPropertyName]: binaryData },
              pairedItem: { item: i },
            });
          } else {
            throw new NodeOperationError(this.getNode(), `Unsupported operation: ${documentOperation}`, { itemIndex: i });
          }
        } else {
          returnData.push({ json: { error: 'Unsupported resource' }, pairedItem: { item: i } });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
        } else {
          throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
        }
      }
    }

    return [returnData];
  }
}
