import { GoogleAnalyticsIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'
import { getScopesForService } from '@/lib/oauth/utils'
import type { GoogleAnalyticsResponse } from '@/tools/google_analytics/types'

export const GoogleAnalyticsBlock: BlockConfig<GoogleAnalyticsResponse> = {
  type: 'google_analytics',
  name: 'Google Analytics',
  description: 'Query GA4 analytics data and reports',
  authMode: AuthMode.OAuth,
  longDescription:
    'Integrate Google Analytics GA4 into your workflow. Run custom reports, get realtime data, and discover available dimensions and metrics.',
  docsLink: 'https://docs.sim.ai/tools/google_analytics',
  category: 'tools',
  bgColor: '#E0E0E0',
  icon: GoogleAnalyticsIcon,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Run Report', id: 'run_report' },
        { label: 'Run Realtime Report', id: 'run_realtime_report' },
        { label: 'Get Metadata', id: 'get_metadata' },
      ],
      value: () => 'run_report',
    },
    {
      id: 'credential',
      title: 'Google Analytics Account',
      type: 'oauth-input',
      canonicalParamId: 'oauthCredential',
      mode: 'basic',
      required: true,
      serviceId: 'google-analytics',
      requiredScopes: getScopesForService('google-analytics'),
      placeholder: 'Select Google Analytics account',
    },
    {
      id: 'manualCredential',
      title: 'Google Analytics Account',
      type: 'short-input',
      canonicalParamId: 'oauthCredential',
      mode: 'advanced',
      placeholder: 'Enter credential ID',
      required: true,
    },
    {
      id: 'propertyId',
      title: 'Property ID',
      type: 'short-input',
      placeholder: 'GA4 property ID (e.g., 123456789)',
      required: true,
    },
    {
      id: 'metrics',
      title: 'Metrics',
      type: 'short-input',
      placeholder: 'e.g., activeUsers,sessions,screenPageViews',
      condition: { field: 'operation', value: ['run_report', 'run_realtime_report'] },
      required: { field: 'operation', value: ['run_report', 'run_realtime_report'] },
      wandConfig: {
        enabled: true,
        prompt: `Generate a comma-separated list of GA4 metric API names based on the user's description.
Common metrics: activeUsers, sessions, screenPageViews, bounceRate, averageSessionDuration, conversions, totalRevenue, newUsers, engagedSessions, engagementRate, eventsPerSession, eventCount, totalUsers.
Return ONLY the comma-separated metric names - no explanations, no extra text.`,
        placeholder: 'Describe the metrics you want...',
      },
    },
    {
      id: 'dimensions',
      title: 'Dimensions',
      type: 'short-input',
      placeholder: 'e.g., date,country,deviceCategory',
      condition: { field: 'operation', value: 'run_report' },
      required: { field: 'operation', value: 'run_report' },
      wandConfig: {
        enabled: true,
        prompt: `Generate a comma-separated list of GA4 dimension API names based on the user's description.
Common dimensions: date, country, city, deviceCategory, browser, operatingSystem, sessionSource, sessionMedium, sessionCampaignName, pagePath, pageTitle, landingPage, language, newVsReturning.
Return ONLY the comma-separated dimension names - no explanations, no extra text.`,
        placeholder: 'Describe the dimensions you want...',
      },
    },
    {
      id: 'realtimeDimensions',
      title: 'Dimensions',
      type: 'short-input',
      placeholder: 'e.g., unifiedScreenName,country (optional)',
      condition: { field: 'operation', value: 'run_realtime_report' },
      wandConfig: {
        enabled: true,
        prompt: `Generate a comma-separated list of GA4 realtime dimension API names.
Common realtime dimensions: unifiedScreenName, country, city, deviceCategory, platform, streamName, audienceName.
Return ONLY the comma-separated dimension names - no explanations, no extra text.`,
        placeholder: 'Describe the dimensions you want...',
      },
    },
    {
      id: 'startDate',
      title: 'Start Date',
      type: 'short-input',
      placeholder: 'e.g., 7daysAgo, 30daysAgo, 2024-01-01',
      condition: { field: 'operation', value: 'run_report' },
      required: { field: 'operation', value: 'run_report' },
      wandConfig: {
        enabled: true,
        prompt: 'Generate a GA4 date string. Supported formats: YYYY-MM-DD, or relative dates like "today", "yesterday", "NdaysAgo" (e.g., "7daysAgo", "30daysAgo"). Return ONLY the date string.',
        generationType: 'timestamp',
      },
    },
    {
      id: 'endDate',
      title: 'End Date',
      type: 'short-input',
      placeholder: 'e.g., today, yesterday, 2024-12-31',
      condition: { field: 'operation', value: 'run_report' },
      required: { field: 'operation', value: 'run_report' },
      wandConfig: {
        enabled: true,
        prompt: 'Generate a GA4 date string. Supported formats: YYYY-MM-DD, or relative dates like "today", "yesterday", "NdaysAgo" (e.g., "7daysAgo", "30daysAgo"). Return ONLY the date string.',
        generationType: 'timestamp',
      },
    },
    {
      id: 'dimensionFilter',
      title: 'Dimension Filter',
      type: 'long-input',
      placeholder: 'JSON filter (e.g., {"filter":{"fieldName":"country","stringFilter":{"value":"US"}}})',
      condition: { field: 'operation', value: ['run_report', 'run_realtime_report'] },
      mode: 'advanced',
      wandConfig: {
        enabled: true,
        prompt: `Generate a GA4 dimension filter JSON object.
Format: {"filter":{"fieldName":"dimensionName","stringFilter":{"matchType":"EXACT","value":"filterValue"}}}
For multiple filters use: {"andGroup":{"expressions":[...]}} or {"orGroup":{"expressions":[...]}}
Match types: EXACT, BEGINS_WITH, ENDS_WITH, CONTAINS, FULL_REGEXP, PARTIAL_REGEXP.
Return ONLY valid JSON - no explanations.`,
        generationType: 'json-object',
        placeholder: 'Describe how to filter dimensions...',
      },
    },
    {
      id: 'metricFilter',
      title: 'Metric Filter',
      type: 'long-input',
      placeholder: 'JSON filter for metrics',
      condition: { field: 'operation', value: ['run_report', 'run_realtime_report'] },
      mode: 'advanced',
      wandConfig: {
        enabled: true,
        prompt: `Generate a GA4 metric filter JSON object.
Format: {"filter":{"fieldName":"metricName","numericFilter":{"operation":"GREATER_THAN","value":{"int64Value":"100"}}}}
Operations: EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL, GREATER_THAN, GREATER_THAN_OR_EQUAL.
Return ONLY valid JSON - no explanations.`,
        generationType: 'json-object',
        placeholder: 'Describe how to filter metrics...',
      },
    },
    {
      id: 'orderBys',
      title: 'Order By',
      type: 'long-input',
      placeholder: 'JSON array (e.g., [{"metric":{"metricName":"activeUsers"},"desc":true}])',
      condition: { field: 'operation', value: 'run_report' },
      mode: 'advanced',
      wandConfig: {
        enabled: true,
        prompt: `Generate a GA4 orderBys JSON array.
Format for metric sort: [{"metric":{"metricName":"metricName"},"desc":true}]
Format for dimension sort: [{"dimension":{"dimensionName":"dimensionName"},"desc":false}]
Return ONLY valid JSON array - no explanations.`,
        generationType: 'json-object',
        placeholder: 'Describe how to sort results...',
      },
    },
    {
      id: 'limit',
      title: 'Row Limit',
      type: 'short-input',
      placeholder: 'Max rows to return (default: 10000)',
      condition: { field: 'operation', value: ['run_report', 'run_realtime_report'] },
      mode: 'advanced',
    },
    {
      id: 'offset',
      title: 'Row Offset',
      type: 'short-input',
      placeholder: 'Starting row for pagination (default: 0)',
      condition: { field: 'operation', value: 'run_report' },
      mode: 'advanced',
    },
    {
      id: 'startMinutesAgo',
      title: 'Start Minutes Ago',
      type: 'short-input',
      placeholder: 'Start of time window in minutes ago (default: 29)',
      condition: { field: 'operation', value: 'run_realtime_report' },
      mode: 'advanced',
    },
    {
      id: 'endMinutesAgo',
      title: 'End Minutes Ago',
      type: 'short-input',
      placeholder: 'End of time window in minutes ago (default: 0)',
      condition: { field: 'operation', value: 'run_realtime_report' },
      mode: 'advanced',
    },
    {
      id: 'keepEmptyRows',
      title: 'Keep Empty Rows',
      type: 'dropdown',
      options: [
        { label: 'No (default)', id: '' },
        { label: 'Yes', id: 'true' },
      ],
      placeholder: 'Include rows with all zero metric values',
      condition: { field: 'operation', value: 'run_report' },
      mode: 'advanced',
    },
    {
      id: 'currencyCode',
      title: 'Currency Code',
      type: 'short-input',
      placeholder: 'e.g., USD, EUR',
      condition: { field: 'operation', value: 'run_report' },
      mode: 'advanced',
    },
  ],
  tools: {
    access: [
      'google_analytics_run_report',
      'google_analytics_run_realtime_report',
      'google_analytics_get_metadata',
    ],
    config: {
      tool: (params) => {
        switch (params.operation) {
          case 'run_report':
            return 'google_analytics_run_report'
          case 'run_realtime_report':
            return 'google_analytics_run_realtime_report'
          case 'get_metadata':
            return 'google_analytics_get_metadata'
          default:
            throw new Error(`Invalid Google Analytics operation: ${params.operation}`)
        }
      },
      params: (params) => {
        const { oauthCredential, realtimeDimensions, keepEmptyRows, ...rest } = params

        return {
          oauthCredential,
          ...rest,
          dimensions: params.operation === 'run_realtime_report'
            ? realtimeDimensions
            : rest.dimensions,
          limit: rest.limit ? Number.parseInt(rest.limit as string, 10) : undefined,
          offset: rest.offset ? Number.parseInt(rest.offset as string, 10) : undefined,
          startMinutesAgo: rest.startMinutesAgo
            ? Number.parseInt(rest.startMinutesAgo as string, 10)
            : undefined,
          endMinutesAgo: rest.endMinutesAgo
            ? Number.parseInt(rest.endMinutesAgo as string, 10)
            : undefined,
          keepEmptyRows: keepEmptyRows === 'true' ? true : undefined,
        }
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    oauthCredential: { type: 'string', description: 'Google Analytics access token' },
    propertyId: { type: 'string', description: 'GA4 property ID' },
    metrics: { type: 'string', description: 'Comma-separated metric names' },
    dimensions: { type: 'string', description: 'Comma-separated dimension names' },
    realtimeDimensions: { type: 'string', description: 'Comma-separated realtime dimension names' },
    startDate: { type: 'string', description: 'Report start date' },
    endDate: { type: 'string', description: 'Report end date' },
    dimensionFilter: { type: 'string', description: 'Dimension filter JSON' },
    metricFilter: { type: 'string', description: 'Metric filter JSON' },
    orderBys: { type: 'string', description: 'Order by specification JSON' },
    limit: { type: 'string', description: 'Maximum rows to return' },
    offset: { type: 'string', description: 'Starting row offset' },
    startMinutesAgo: { type: 'string', description: 'Realtime start minutes ago' },
    endMinutesAgo: { type: 'string', description: 'Realtime end minutes ago' },
    keepEmptyRows: { type: 'string', description: 'Include rows with all zero metric values' },
    currencyCode: { type: 'string', description: 'Currency code for revenue metrics' },
  },
  outputs: {
    dimensionHeaders: { type: 'json', description: 'Dimension column headers' },
    metricHeaders: { type: 'json', description: 'Metric column headers' },
    rows: { type: 'json', description: 'Report data rows' },
    rowCount: { type: 'number', description: 'Total number of rows' },
    metadata: { type: 'json', description: 'Report metadata (currency, timezone)' },
    dimensions: { type: 'json', description: 'Available dimensions (from get_metadata)' },
    metrics: { type: 'json', description: 'Available metrics (from get_metadata)' },
  },
}
