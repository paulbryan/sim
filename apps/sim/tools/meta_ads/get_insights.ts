import type { MetaAdsGetInsightsParams, MetaAdsGetInsightsResponse } from '@/tools/meta_ads/types'
import { getMetaApiBaseUrl } from '@/tools/meta_ads/types'
import type { ToolConfig } from '@/tools/types'

export const metaAdsGetInsightsTool: ToolConfig<
  MetaAdsGetInsightsParams,
  MetaAdsGetInsightsResponse
> = {
  id: 'meta_ads_get_insights',
  name: 'Get Meta Ads Insights',
  description: 'Get performance insights and metrics for Meta Ads campaigns, ad sets, or ads',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'meta-ads',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'OAuth access token for the Meta Marketing API',
    },
    accountId: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Meta Ads account ID (numeric, without act_ prefix)',
    },
    level: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Aggregation level for insights (account, campaign, adset, ad)',
    },
    campaignId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Filter insights by campaign ID',
    },
    adSetId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Filter insights by ad set ID',
    },
    datePreset: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Predefined date range (today, yesterday, last_7d, last_14d, last_28d, last_30d, last_90d, maximum, this_month, last_month)',
    },
    startDate: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Custom start date in YYYY-MM-DD format',
    },
    endDate: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Custom end date in YYYY-MM-DD format',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of insight rows to return',
    },
  },

  request: {
    url: (params) => {
      const fields =
        'account_id,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions,date_start,date_stop'
      const searchParams = new URLSearchParams({ fields, level: params.level })

      if (params.startDate && params.endDate) {
        searchParams.set(
          'time_range',
          JSON.stringify({ since: params.startDate, until: params.endDate })
        )
      } else if (params.datePreset) {
        searchParams.set('date_preset', params.datePreset)
      } else {
        searchParams.set('date_preset', 'last_30d')
      }

      if (params.limit) {
        searchParams.set('limit', String(params.limit))
      }

      let parentId: string
      if (params.adSetId) {
        parentId = params.adSetId.trim()
      } else if (params.campaignId) {
        parentId = params.campaignId.trim()
      } else {
        parentId = `act_${params.accountId.trim()}`
      }

      return `${getMetaApiBaseUrl()}/${parentId}/insights?${searchParams.toString()}`
    },
    method: 'GET',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!response.ok) {
      const errorMessage = data?.error?.message ?? 'Unknown error'
      return {
        success: false,
        output: { insights: [], totalCount: 0 },
        error: errorMessage,
      }
    }

    const items = data.data ?? []
    const insights = items.map((i: Record<string, unknown>) => {
      const actions = (i.actions as Array<Record<string, unknown>>) ?? []
      const conversionTypes = new Set([
        'offsite_conversion',
        'onsite_conversion',
        'app_custom_event',
      ])
      const conversions = actions
        .filter((a) => {
          const actionType = a.action_type as string
          return conversionTypes.has(actionType) || actionType?.startsWith('offsite_conversion.')
        })
        .reduce((sum, a) => sum + Number(a.value ?? 0), 0)

      return {
        accountId: (i.account_id as string) ?? null,
        campaignId: (i.campaign_id as string) ?? null,
        campaignName: (i.campaign_name as string) ?? null,
        adSetId: (i.adset_id as string) ?? null,
        adSetName: (i.adset_name as string) ?? null,
        adId: (i.ad_id as string) ?? null,
        adName: (i.ad_name as string) ?? null,
        impressions: (i.impressions as string) ?? '0',
        clicks: (i.clicks as string) ?? '0',
        spend: (i.spend as string) ?? '0',
        ctr: (i.ctr as string) ?? null,
        cpc: (i.cpc as string) ?? null,
        cpm: (i.cpm as string) ?? null,
        reach: (i.reach as string) ?? null,
        frequency: (i.frequency as string) ?? null,
        conversions,
        dateStart: (i.date_start as string) ?? '',
        dateStop: (i.date_stop as string) ?? '',
      }
    })

    return {
      success: true,
      output: {
        insights,
        totalCount: insights.length,
      },
    }
  },

  outputs: {
    insights: {
      type: 'array',
      description: 'Performance insight rows',
      items: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Ad account ID' },
          campaignId: { type: 'string', description: 'Campaign ID' },
          campaignName: { type: 'string', description: 'Campaign name' },
          adSetId: { type: 'string', description: 'Ad set ID' },
          adSetName: { type: 'string', description: 'Ad set name' },
          adId: { type: 'string', description: 'Ad ID' },
          adName: { type: 'string', description: 'Ad name' },
          impressions: { type: 'string', description: 'Number of impressions' },
          clicks: { type: 'string', description: 'Number of clicks' },
          spend: { type: 'string', description: 'Amount spent in account currency' },
          ctr: { type: 'string', description: 'Click-through rate' },
          cpc: { type: 'string', description: 'Cost per click' },
          cpm: { type: 'string', description: 'Cost per 1,000 impressions' },
          reach: { type: 'string', description: 'Number of unique users reached' },
          frequency: {
            type: 'string',
            description: 'Average number of times each person saw the ad',
          },
          conversions: { type: 'number', description: 'Total conversions from actions' },
          dateStart: { type: 'string', description: 'Start date of the reporting period' },
          dateStop: { type: 'string', description: 'End date of the reporting period' },
        },
      },
    },
    totalCount: {
      type: 'number',
      description: 'Total number of insight rows returned',
    },
  },
}
