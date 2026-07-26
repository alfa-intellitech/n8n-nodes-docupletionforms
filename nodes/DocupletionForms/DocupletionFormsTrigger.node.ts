import type { IHookFunctions, ILoadOptionsFunctions, IWebhookFunctions } from 'n8n-workflow';
import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { docupletionFormsApiRequest, loadDocupletionDocumentSets } from '../shared/GenericFunctions';

const WEBHOOK_ID_KEY = 'webhookId';

export class DocupletionFormsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DocupletionForms Trigger',
    name: 'docupletionFormsTrigger',
    icon: 'file:docupletionforms.svg',
    group: ['trigger'],
    version: 1,
    description:
      'Triggers when DocupletionForms merges a submission into a PDF document set',
    defaults: { name: 'DocupletionForms Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'docupletionFormsApi', required: true }],
    properties: [
      {
        displayName: 'Document Set Name or ID',
        name: 'documentSetId',
        type: 'options',
        required: true,
        description:
          'The document set (PDF template grouping) to watch. DocupletionForms only supports webhooks scoped to a document set — there is no tenant-wide or per-form-only merge event. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
        typeOptions: { loadOptionsMethod: 'getDocumentSets' },
        default: '',
      },
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: [
          {
            displayName: 'Include Submission Data',
            name: 'includeSubmission',
            type: 'boolean',
            default: true,
            description: 'Whether to include the raw submission fields (the "submission" object) alongside the document metadata',
          },
        ],
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node');
        const webhookId = staticData[WEBHOOK_ID_KEY] as string | undefined;
        return Boolean(webhookId);
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const documentSetId = this.getNodeParameter('documentSetId', 0) as string;
        const staticData = this.getWorkflowStaticData('node');
        const body: IDataObject = {
          fillable_pdf_id: documentSetId,
          url: webhookUrl,
          // 1 = INFO: send the JSON metadata body only (no file attachment) —
          // see DocumentWebhookResource/FillablePdfWebhook::content_type.
          content_type: 1,
        };
        const result = await docupletionFormsApiRequest.call(this, 'POST', '/documents/webhooks', body);
        const res = result as { id?: string | number };
        if (res?.id !== undefined) {
          staticData[WEBHOOK_ID_KEY] = res.id;
          return true;
        }
        throw new NodeOperationError(this.getNode(), 'Failed to create webhook: no ID returned');
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node');
        const webhookId = staticData[WEBHOOK_ID_KEY] as string | undefined;
        if (webhookId) {
          await docupletionFormsApiRequest.call(this, 'DELETE', `/documents/webhooks/${webhookId}`);
          delete staticData[WEBHOOK_ID_KEY];
        }
        return true;
      },
    },
  };

  methods = {
    loadOptions: {
      async getDocumentSets(this: ILoadOptionsFunctions) {
        return await loadDocupletionDocumentSets.call(this);
      },
    },
  };

  webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const body = req.body as IDataObject;
    const additionalFields = (this.getNodeParameter('additionalFields', 0) || {}) as IDataObject;
    const includeSubmission = additionalFields.includeSubmission as boolean | undefined;

    // DocupletionForms does not sign or secret-verify webhook deliveries
    // (see modules/addons/modules/fillable_pdf/Module.php's dispatch code) —
    // there is nothing to verify here.
    const output: IDataObject = { ...body };
    if (includeSubmission === false && output.submission !== undefined) {
      delete output.submission;
    }

    return Promise.resolve({
      workflowData: [[{ json: output }]],
    });
  }
}
