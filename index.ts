import type { ICredentialType } from 'n8n-workflow';
import type { INodeType } from 'n8n-workflow';

import { DocupletionFormsApi } from './credentials/DocupletionFormsApi.credentials';
import { DocupletionForms } from './nodes/DocupletionForms/DocupletionForms.node';
import { DocupletionFormsTrigger } from './nodes/DocupletionForms/DocupletionFormsTrigger.node';
import { DocupletionFormsTool } from './nodes/DocupletionForms/DocupletionFormsTool.node';

export const credentials: ICredentialType[] = [new DocupletionFormsApi()];
export const nodes: INodeType[] = [
  new DocupletionForms(),
  new DocupletionFormsTrigger(),
  new DocupletionFormsTool(),
];
