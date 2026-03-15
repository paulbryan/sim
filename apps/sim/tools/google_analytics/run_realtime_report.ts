import type { ToolConfig } from '@/tools/types'
import type {
  GoogleAnalyticsRunRealtimeReportParams,
  GoogleAnalyticsRunRealtimeReportResponse,
} from '@/tools/google_analytics/types'

export const runRealtimeReportTool: ToolConfig<
  GoogleAnalyticsRunRealtimeReportParams,
  GoogleAnalyticsRunRealtimeReportResponse
> = {
  id: 'google_analytics_run_realtime_report',
  name: 'Run Google Analytics Realtime Report',
  description: 'Run a realtime report on Google Analytics GA4 property data from the last 30 minutes',
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
      description: 'The GA4 property ID (e.g., 123456789)',
    },
    dimensions: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Comma-separated dimension names for realtime data (e.g., unifiedScreenName,country,deviceCategory)',
    },
    metrics: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Comma-separated metric names (e.g., activeUsers,screenPageViews,conversions)',
    },
    dimensionFilter: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Dimension filter as JSON',
    },
    metricFilter: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Metric filter as JSON',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of rows to return (default: 10000, max: 250000)',
    },
    startMinutesAgo: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Start of the time window in minutes ago (default: 29, max: 29 for standard, 59 for 360)',
    },
    endMinutesAgo: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'End of the time window in minutes ago (default: 0, meaning now)',
    },
  },

  request: {
    url: (params) =>
      `https://analyticsdata.googleapis.com/v1beta/properties/${params.propertyId.trim()}:runRealtimeReport`,
    method: 'POST',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const body: Record<string, unknown> = {
        metrics: params.metrics
          .split(',')
          .map((m: string) => ({ name: m.trim() })),
      }

      if (params.dimensions) {
        body.dimensions = params.dimensions
          .split(',')
          .map((d: string) => ({ name: d.trim() }))
      }
      if (params.dimensionFilter) {
        body.dimensionFilter = JSON.parse(params.dimensionFilter)
      }
      if (params.metricFilter) {
        body.metricFilter = JSON.parse(params.metricFilter)
      }
      if (params.limit !== undefined) {
        body.limit = params.limit
      }
      if (params.startMinutesAgo !== undefined || params.endMinutesAgo !== undefined) {
        body.minuteRanges = [
          {
            startMinutesAgo: params.startMinutesAgo ?? 29,
            endMinutesAgo: params.endMinutesAgo ?? 0,
          },
        ]
      }

      return body
    },
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to run Google Analytics realtime report')
    }

    return {
      success: true,
      output: {
        dimensionHeaders: data.dimensionHeaders ?? [],
        metricHeaders: data.metricHeaders ?? [],
        rows: data.rows ?? [],
        rowCount: data.rowCount ?? null,
      },
    }
  },

  outputs: {
    dimensionHeaders: {
      type: 'array',
      description: 'Dimension column headers',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Dimension name' },
        },
      },
    },
    metricHeaders: {
      type: 'array',
      description: 'Metric column headers',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Metric name' },
          type: { type: 'string', description: 'Metric data type' },
        },
      },
    },
    rows: {
      type: 'array',
      description: 'Realtime report data rows',
      items: {
        type: 'object',
        properties: {
          dimensionValues: {
            type: 'json',
            description: 'Array of dimension values for this row',
          },
          metricValues: {
            type: 'json',
            description: 'Array of metric values for this row',
          },
        },
      },
    },
    rowCount: {
      type: 'number',
      description: 'Total number of rows in the result',
      optional: true,
    },
  },
}
