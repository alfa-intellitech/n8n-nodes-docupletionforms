import type { IHookFunctions, ILoadOptionsFunctions, IWebhookFunctions } from 'n8n-workflow';
import type {
  IDataObject,
  INodeListSearchResult,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
  docupletionFormsApiRequest,
  searchDocupletionDocumentSets,
  searchDocupletionForms,
} from '../shared/GenericFunctions';

const WEBHOOK_ID_KEY = 'webhookId';
const WEBHOOK_EVENT_KEY = 'webhookEvent';

export class DocupletionFormsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DocupletionForms Trigger',
    name: 'docupletionFormsTrigger',
    icon: 'file:docupletionforms.svg',
    group: ['trigger'],
    version: 1,
    subtitle:
      '={{$parameter["event"] === "formSubmitted" ? "Form: " + $parameter["formId"] : "Document Set: " + $parameter["documentSetId"]}}',
    description:
      'Triggers when DocupletionForms receives a new form submission, or merges a submission into a PDF document set',
    defaults: { name: 'DocupletionForms Trigger' },
    usableAsTool: true,
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'docupletionFormsApi', required: true }],
    properties: [
      {
        displayName: 'Event',
        name: 'event',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Form Submitted',
            value: 'formSubmitted',
            description: 'Triggers on every new submission received for a form',
          },
          {
            name: 'Document Merged',
            value: 'documentMerged',
            description: 'Triggers when a submission is merged into a PDF for a document set',
          },
        ],
        // Kept as the pre-existing (only) behavior for backward compatibility
        // with workflows saved before the "Form Submitted" event existed.
        default: 'documentMerged',
      },
      {
        displayName: 'Form',
        name: 'formId',
        type: 'resourceLocator',
        required: true,
        displayOptions: { show: { event: ['formSubmitted'] } },
        description: 'The form to watch for new submissions',
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
        displayName: 'Document Set',
        name: 'documentSetId',
        type: 'resourceLocator',
        required: true,
        displayOptions: { show: { event: ['documentMerged'] } },
        description:
          'The document set (PDF template grouping) to watch. DocupletionForms only supports merge webhooks scoped to a document set — there is no tenant-wide or per-form-only merge event.',
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
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        displayOptions: { show: { event: ['documentMerged'] } },
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
        const event = this.getNodeParameter('event', 'documentMerged') as string;
        const staticData = this.getWorkflowStaticData('node');

        let result: unknown;
        if (event === 'formSubmitted') {
          const formId = this.getNodeParameter('formId', undefined, { extractValue: true }) as string;
          const workflow = this.getWorkflow();
          // Required by the backend (addon_webhooks.name is NOT NULL with no
          // default at the DB layer, even though the model itself doesn't
          // require it) — auto-generate one so the user isn't asked for it.
          const name = `n8n: ${workflow.name || 'workflow'} #${workflow.id ?? ''}`.slice(0, 255);
          const body: IDataObject = {
            form_id: formId,
            url: webhookUrl,
            name,
            status: 1,
            // 1 = send the submission payload as JSON (vs. url-encoded form
            // data) — see webhooks addon Module::sendSubmissionData.
            json: 1,
          };
          // This route has no tenant segment — the backend derives the
          // tenant from the API key's user identity server-side.
          result = await docupletionFormsApiRequest.call(this, 'POST', '/webhooks', body, {}, false);
        } else {
          const documentSetId = this.getNodeParameter('documentSetId', undefined, { extractValue: true }) as string;
          const body: IDataObject = {
            fillable_pdf_id: documentSetId,
            url: webhookUrl,
            // 1 = INFO: send the JSON metadata body only (no file attachment) —
            // see DocumentWebhookResource/FillablePdfWebhook::content_type.
            content_type: 1,
          };
          result = await docupletionFormsApiRequest.call(this, 'POST', '/documents/webhooks', body);
        }

        const res = result as { id?: string | number };
        if (res?.id !== undefined) {
          staticData[WEBHOOK_ID_KEY] = res.id;
          staticData[WEBHOOK_EVENT_KEY] = event;
          return true;
        }
        throw new NodeOperationError(this.getNode(), 'Failed to create webhook: no ID returned');
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const staticData = this.getWorkflowStaticData('node');
        const webhookId = staticData[WEBHOOK_ID_KEY] as string | undefined;
        if (webhookId) {
          // Read which event type the *stored* webhook was created for —
          // not the node's current parameter value, which may already have
          // changed to the other event by the time n8n calls delete() to
          // tear down the old registration before re-creating.
          const event = (staticData[WEBHOOK_EVENT_KEY] as string | undefined) ?? 'documentMerged';
          if (event === 'formSubmitted') {
            await docupletionFormsApiRequest.call(this, 'DELETE', `/webhooks/${webhookId}`, {}, {}, false);
          } else {
            await docupletionFormsApiRequest.call(this, 'DELETE', `/documents/webhooks/${webhookId}`);
          }
          delete staticData[WEBHOOK_ID_KEY];
          delete staticData[WEBHOOK_EVENT_KEY];
        }
        return true;
      },
    },
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

  webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject();
    const body = req.body as IDataObject;
    const event = this.getNodeParameter('event', 'documentMerged') as string;

    // DocupletionForms does not sign or secret-verify webhook deliveries
    // (see modules/addons/modules/webhooks/Module.php's dispatch code) —
    // there is nothing to verify here for either event type.
    const output: IDataObject = { ...body };
    if (event === 'documentMerged') {
      const additionalFields = (this.getNodeParameter('additionalFields', 0) || {}) as IDataObject;
      const includeSubmission = additionalFields.includeSubmission as boolean | undefined;
      if (includeSubmission === false && output.submission !== undefined) {
        delete output.submission;
      }
    }

    return Promise.resolve({
      workflowData: [[{ json: output }]],
    });
  }
}
