import type { ToolResponse } from '@/tools/types'

export interface GoogleAnalyticsRunReportParams {
  accessToken: string
  propertyId: string
  dimensions: string
  metrics: string
  startDate: string
  endDate: string
  dimensionFilter?: string
  metricFilter?: string
  orderBys?: string
  limit?: number
  offset?: number
  keepEmptyRows?: boolean
  currencyCode?: string
}

export interface GoogleAnalyticsRunRealtimeReportParams {
  accessToken: string
  propertyId: string
  dimensions?: string
  metrics: string
  dimensionFilter?: string
  metricFilter?: string
  limit?: number
  startMinutesAgo?: number
  endMinutesAgo?: number
}

export interface GoogleAnalyticsGetMetadataParams {
  accessToken: string
  propertyId: string
}

export interface GoogleAnalyticsDimensionHeader {
  name: string
}

export interface GoogleAnalyticsMetricHeader {
  name: string
  type: string
}

export interface GoogleAnalyticsRow {
  dimensionValues: Array<{ value: string }>
  metricValues: Array<{ value: string }>
}

export interface GoogleAnalyticsRunReportResponse extends ToolResponse {
  output: {
    dimensionHeaders: GoogleAnalyticsDimensionHeader[]
    metricHeaders: GoogleAnalyticsMetricHeader[]
    rows: GoogleAnalyticsRow[]
    rowCount: number | null
    metadata: {
      currencyCode: string | null
      timeZone: string | null
    } | null
  }
}

export interface GoogleAnalyticsRunRealtimeReportResponse extends ToolResponse {
  output: {
    dimensionHeaders: GoogleAnalyticsDimensionHeader[]
    metricHeaders: GoogleAnalyticsMetricHeader[]
    rows: GoogleAnalyticsRow[]
    rowCount: number | null
  }
}

export interface GoogleAnalyticsDimensionMetadata {
  apiName: string
  uiName: string
  description: string
  category: string
}

export interface GoogleAnalyticsMetricMetadata {
  apiName: string
  uiName: string
  description: string
  category: string
  type: string
}

export interface GoogleAnalyticsGetMetadataResponse extends ToolResponse {
  output: {
    dimensions: GoogleAnalyticsDimensionMetadata[]
    metrics: GoogleAnalyticsMetricMetadata[]
  }
}

export type GoogleAnalyticsResponse =
  | GoogleAnalyticsRunReportResponse
  | GoogleAnalyticsRunRealtimeReportResponse
  | GoogleAnalyticsGetMetadataResponse
