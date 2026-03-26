import type {
  IroncladUpdateWorkflowMetadataParams,
  IroncladUpdateWorkflowMetadataResponse,
} from '@/tools/ironclad/types'
import type { ToolConfig } from '@/tools/types'

export const updateWorkflowMetadataTool: ToolConfig<
  IroncladUpdateWorkflowMetadataParams,
  IroncladUpdateWorkflowMetadataResponse
> = {
  id: 'ironclad_update_workflow_metadata',
  name: 'Ironclad Update Workflow Metadata',
  description:
    'Update attributes on a workflow. The workflow must be in the Review step. Supports set and remove actions.',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'ironclad',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'OAuth access token',
    },
    workflowId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'The unique identifier of the workflow',
    },
    actions: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'JSON array of actions. Each action has "action" (set/remove), "field", and optionally "value".',
    },
  },

  request: {
    url: (params) =>
      `https://na1.ironcladapp.com/public/api/v1/workflows/${params.workflowId.trim()}/attributes`,
    method: 'PATCH',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: (params) => ({
      actions: JSON.parse(params.actions),
    }),
  },

  transformResponse: async (response: Response) => {
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || data.error || 'Failed to update workflow metadata')
    }

    return {
      success: true,
      output: {
        success: true,
      },
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Whether the update was successful' },
  },
}
