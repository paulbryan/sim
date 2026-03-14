import type { MetaAdsListAdSetsParams, MetaAdsListAdSetsResponse } from '@/tools/meta_ads/types'
import { getMetaApiBaseUrl, stripActPrefix } from '@/tools/meta_ads/types'
import type { ToolConfig } from '@/tools/types'

export const metaAdsListAdSetsTool: ToolConfig<MetaAdsListAdSetsParams, MetaAdsListAdSetsResponse> =
  {
    id: 'meta_ads_list_ad_sets',
    name: 'List Meta Ads Ad Sets',
    description: 'List ad sets in a Meta Ads account or campaign',
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
      campaignId: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Filter ad sets by campaign ID',
      },
      status: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Filter by ad set status (ACTIVE, PAUSED, ARCHIVED, DELETED)',
      },
      limit: {
        type: 'number',
        required: false,
        visibility: 'user-or-llm',
        description: 'Maximum number of ad sets to return',
      },
    },

    request: {
      url: (params) => {
        const fields = 'id,name,status,campaign_id,daily_budget,lifetime_budget,start_time,end_time'
        const searchParams = new URLSearchParams({ fields })

        if (params.status) {
          searchParams.set('effective_status', JSON.stringify([params.status]))
        }
        if (params.limit) {
          searchParams.set('limit', String(params.limit))
        }

        const parentId = params.campaignId?.trim() || `act_${stripActPrefix(params.accountId)}`
        return `${getMetaApiBaseUrl()}/${parentId}/adsets?${searchParams.toString()}`
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
          output: { adSets: [], totalCount: 0 },
          error: errorMessage,
        }
      }

      const items = data.data ?? []
      const adSets = items.map((a: Record<string, unknown>) => ({
        id: (a.id as string) ?? '',
        name: (a.name as string) ?? '',
        status: (a.status as string) ?? '',
        campaignId: (a.campaign_id as string) ?? '',
        dailyBudget: (a.daily_budget as string) ?? null,
        lifetimeBudget: (a.lifetime_budget as string) ?? null,
        startTime: (a.start_time as string) ?? null,
        endTime: (a.end_time as string) ?? null,
      }))

      return {
        success: true,
        output: {
          adSets,
          totalCount: adSets.length,
        },
      }
    },

    outputs: {
      adSets: {
        type: 'array',
        description: 'List of ad sets',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Ad set ID' },
            name: { type: 'string', description: 'Ad set name' },
            status: { type: 'string', description: 'Ad set status' },
            campaignId: { type: 'string', description: 'Parent campaign ID' },
            dailyBudget: { type: 'string', description: 'Daily budget in account currency cents' },
            lifetimeBudget: {
              type: 'string',
              description: 'Lifetime budget in account currency cents',
            },
            startTime: { type: 'string', description: 'Ad set start time (ISO 8601)' },
            endTime: { type: 'string', description: 'Ad set end time (ISO 8601)' },
          },
        },
      },
      totalCount: {
        type: 'number',
        description: 'Number of ad sets returned in this response (may be limited by pagination)',
      },
    },
  }
