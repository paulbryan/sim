import type { ToolConfig } from '@/tools/types'
import type {
  GoogleAnalyticsGetMetadataParams,
  GoogleAnalyticsGetMetadataResponse,
} from '@/tools/google_analytics/types'

export const getMetadataTool: ToolConfig<
  GoogleAnalyticsGetMetadataParams,
  GoogleAnalyticsGetMetadataResponse
> = {
  id: 'google_analytics_get_metadata',
  name: 'Get Google Analytics Metadata',
  description:
    'Get available dimensions, metrics, and their descriptions for a Google Analytics GA4 property',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'google-analytics',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'The access token for the Google Analytics API',
    },
    propertyId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'The GA4 property ID (e.g., 123456789). Use 0 to get universal metadata available across all properties.',
    },
  },

  request: {
    url: (params) =>
      `https://analyticsdata.googleapis.com/v1beta/properties/${params.propertyId.trim()}/metadata`,
    method: 'GET',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to get Google Analytics metadata')
    }

    return {
      success: true,
      output: {
        dimensions: (data.dimensions ?? []).map(
          (d: { apiName: string; uiName: string; description: string; category: string }) => ({
            apiName: d.apiName ?? '',
            uiName: d.uiName ?? '',
            description: d.description ?? '',
            category: d.category ?? '',
          })
        ),
        metrics: (data.metrics ?? []).map(
          (m: {
            apiName: string
            uiName: string
            description: string
            category: string
            type: string
          }) => ({
            apiName: m.apiName ?? '',
            uiName: m.uiName ?? '',
            description: m.description ?? '',
            category: m.category ?? '',
            type: m.type ?? '',
          })
        ),
      },
    }
  },

  outputs: {
    dimensions: {
      type: 'array',
      description: 'Available dimensions for the property',
      items: {
        type: 'object',
        properties: {
          apiName: { type: 'string', description: 'API name to use in report requests' },
          uiName: { type: 'string', description: 'Human-readable display name' },
          description: { type: 'string', description: 'Description of the dimension' },
          category: { type: 'string', description: 'Category grouping' },
        },
      },
    },
    metrics: {
      type: 'array',
      description: 'Available metrics for the property',
      items: {
        type: 'object',
        properties: {
          apiName: { type: 'string', description: 'API name to use in report requests' },
          uiName: { type: 'string', description: 'Human-readable display name' },
          description: { type: 'string', description: 'Description of the metric' },
          category: { type: 'string', description: 'Category grouping' },
          type: { type: 'string', description: 'Data type of the metric' },
        },
      },
    },
  },
}
