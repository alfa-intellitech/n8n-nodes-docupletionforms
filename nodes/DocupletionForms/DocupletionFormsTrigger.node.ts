import type { IHookFunctions, ILoadOptionsFunctions, IWebhookFunctions } from 'n8n-workflow';
import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { docupletionFormsApiRequest, loadDocupletionForms } from '../shared/GenericFunctions';

const WEBHOOK_ID_KEY = 'webhookId';
const WEBHOOK_SECRET_KEY = 'webhookSecret';

export class DocupletionFormsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DocupletionForms Trigger',
    name: 'docupletionFormsTrigger',
    icon: 'file:docupletionforms.svg',
    group: ['trigger'],
    version: 1,
    description:
      'Triggers when a new form is submitted or a new document is merged in DocupletionForms',
    defaults: { name: 'DocupletionForms Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'docupletionFormsApi', required: true }],
    properties: [
      {
        displayName: 'Trigger On',
        name: 'event',
        type: 'options',
        options: [
          { name: 'New Form Submitted', value: 'submission.created' },
          { name: 'New Merged Document', value: 'document.merged' },
        ],
        default: 'submission.created',
      },
      {
        displayName: 'Form Name or ID',
        name: 'formId',
        type: 'options',
        description: 'Optionally filter by a specific form. Leave blank to receive all merged documents. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
        typeOptions: { loadOptionsMethod: 'getForms' },
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
            displayName: 'Include Merged Document URL',
            name: 'includeMergedDoc',
            type: 'boolean',
            default: false,
            description: 'Whether to include the URL of the merged PDF document in the output',
          },
          {
            displayName: 'Include Submission Data',
            name: 'includeSubmission',
            type: 'boolean',
            default: true,
            description: 'Whether to include the raw submission fields alongside the document metadata',
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
        const event = this.getNodeParameter('event', 0) as string;
        const formId = this.getNodeParameter('formId', 0) as string | undefined;
        const staticData = this.getWorkflowStaticData('node');
        const secret = `n8n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const body: IDataObject = {
          url: webhookUrl,
          event,
          secret,
        };
        if (formId) body.formId = formId;
        const result = await docupletionFormsApiRequest.call(
          this,
          'POST',
          '/webhooks',
          body as IDataObject,
        );
        const res = result as { id?: string; webhookId?: string; data?: { id?: string } };
        const id = res?.id ?? res?.webhookId ?? res?.data?.id;
        if (id) {
          staticData[WEBHOOK_ID_KEY] = id;
          staticData[WEBHOOK_SECRET_KEY] = secret;
          return true;
        }
        throw new NodeOperationError(this.getNode(), 'Failed to create webhook: no ID returned');
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node');
        const webhookId = staticData[WEBHOOK_ID_KEY] as string | undefined;
        if (webhookId) {
          await docupletionFormsApiRequest.call(
            this,
            'DELETE',
            `/webhooks/${webhookId}`,
          );
          delete staticData[WEBHOOK_ID_KEY];
          delete staticData[WEBHOOK_SECRET_KEY];
        }
        return true;
      },
    },
  };

  methods = {
    loadOptions: {
      async getForms(this: ILoadOptionsFunctions) {
        return await loadDocupletionForms.call(this);
      },
    },
  };

  webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const body = req.body as IDataObject;
    const additionalFields = (this.getNodeParameter('additionalFields', 0) || {}) as IDataObject;
    const includeMergedDoc = additionalFields.includeMergedDoc as boolean | undefined;
    const includeSubmission = additionalFields.includeSubmission as boolean | undefined;

    // Optional: verify X-DocupletionForms-Signature if secret is stored
    const staticData = this.getWorkflowStaticData('node');
    const secret = staticData[WEBHOOK_SECRET_KEY];
    if (secret && req.headers['x-docupletionforms-signature']) {
      // Placeholder: implement HMAC verification when API spec is known
      // const sig = req.headers['x-docupletionforms-signature'] as string;
      // if (!verifySignature(body, sig, secret)) throw new Error('Invalid signature');
    }

    const output: IDataObject = { ...body };
    if (includeMergedDoc === true && body.mergedDocumentUrl !== undefined) {
      output.mergedDocumentUrl = body.mergedDocumentUrl;
    }
    if (includeSubmission === false && body.submissionData !== undefined) {
      delete output.submissionData;
    }

    return Promise.resolve({
      workflowData: [[{ json: output }]],
    });
  }
}
