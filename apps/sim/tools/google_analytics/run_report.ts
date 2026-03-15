import type { ToolConfig } from '@/tools/types'
import type {
  GoogleAnalyticsRunReportParams,
  GoogleAnalyticsRunReportResponse,
} from '@/tools/google_analytics/types'

export const runReportTool: ToolConfig<
  GoogleAnalyticsRunReportParams,
  GoogleAnalyticsRunReportResponse
> = {
  id: 'google_analytics_run_report',
  name: 'Run Google Analytics Report',
  description: 'Run a customized report on Google Analytics GA4 property data',
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
      required: true,
      visibility: 'user-or-llm',
      description:
        'Comma-separated dimension names (e.g., date,country,deviceCategory). See GA4 dimensions reference.',
    },
    metrics: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Comma-separated metric names (e.g., activeUsers,sessions,screenPageViews). See GA4 metrics reference.',
    },
    startDate: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Start date in YYYY-MM-DD format, or relative dates like "7daysAgo", "30daysAgo", "yesterday"',
    },
    endDate: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'End date in YYYY-MM-DD format, or "today", "yesterday"',
    },
    dimensionFilter: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Dimension filter as JSON (e.g., {"filter":{"fieldName":"country","stringFilter":{"value":"US"}}})',
    },
    metricFilter: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Metric filter as JSON (e.g., {"filter":{"fieldName":"activeUsers","numericFilter":{"operation":"GREATER_THAN","value":{"int64Value":"100"}}}})',
    },
    orderBys: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Order by specification as JSON array (e.g., [{"metric":{"metricName":"activeUsers"},"desc":true}])',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of rows to return (default: 10000, max: 250000)',
    },
    offset: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Starting row offset for pagination (default: 0)',
    },
    keepEmptyRows: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Whether to include rows with all zero metric values',
    },
    currencyCode: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Currency code for revenue metrics (e.g., USD, EUR)',
    },
  },

  request: {
    url: (params) =>
      `https://analyticsdata.googleapis.com/v1beta/properties/${params.propertyId.trim()}:runReport`,
    method: 'POST',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const body: Record<string, unknown> = {
        dimensions: params.dimensions
          .split(',')
          .map((d: string) => ({ name: d.trim() })),
        metrics: params.metrics
          .split(',')
          .map((m: string) => ({ name: m.trim() })),
        dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      }

      if (params.dimensionFilter) {
        body.dimensionFilter = JSON.parse(params.dimensionFilter)
      }
      if (params.metricFilter) {
        body.metricFilter = JSON.parse(params.metricFilter)
      }
      if (params.orderBys) {
        body.orderBys = JSON.parse(params.orderBys)
      }
      if (params.limit !== undefined) {
        body.limit = params.limit
      }
      if (params.offset !== undefined) {
        body.offset = params.offset
      }
      if (params.keepEmptyRows !== undefined) {
        body.keepEmptyRows = params.keepEmptyRows
      }
      if (params.currencyCode) {
        body.currencyCode = params.currencyCode
      }

      return body
    },
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to run Google Analytics report')
    }

    return {
      success: true,
      output: {
        dimensionHeaders: data.dimensionHeaders ?? [],
        metricHeaders: data.metricHeaders ?? [],
        rows: data.rows ?? [],
        rowCount: data.rowCount ?? null,
        metadata: data.metadata
          ? {
              currencyCode: data.metadata.currencyCode ?? null,
              timeZone: data.metadata.timeZone ?? null,
            }
          : null,
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
      description: 'Report data rows',
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
    metadata: {
      type: 'json',
      description: 'Report metadata including currency code and time zone',
      optional: true,
      properties: {
        currencyCode: { type: 'string', description: 'Currency code used in the report' },
        timeZone: { type: 'string', description: 'Time zone used in the report' },
      },
    },
  },
}
