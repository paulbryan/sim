import { getMetadataTool } from '@/tools/google_analytics/get_metadata'
import { runRealtimeReportTool } from '@/tools/google_analytics/run_realtime_report'
import { runReportTool } from '@/tools/google_analytics/run_report'

export const googleAnalyticsRunReportTool = runReportTool
export const googleAnalyticsRunRealtimeReportTool = runRealtimeReportTool
export const googleAnalyticsGetMetadataTool = getMetadataTool

export * from './types'
