import type {
  MetaAdsListCampaignsParams,
  MetaAdsListCampaignsResponse,
} from '@/tools/meta_ads/types'
import { getMetaApiBaseUrl } from '@/tools/meta_ads/types'
import type { ToolConfig } from '@/tools/types'

export const metaAdsListCampaignsTool: ToolConfig<
  MetaAdsListCampaignsParams,
  MetaAdsListCampaignsResponse
> = {
  id: 'meta_ads_list_campaigns',
  name: 'List Meta Ads Campaigns',
  description: 'List campaigns in a Meta Ads account with optional status filtering',
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
    status: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Filter by campaign status (ACTIVE, PAUSED, ARCHIVED, DELETED)',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of campaigns to return',
    },
  },

  request: {
    url: (params) => {
      const fields =
        'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time'
      const searchParams = new URLSearchParams({ fields })

      if (params.status) {
        searchParams.set('effective_status', JSON.stringify([params.status]))
      }
      if (params.limit) {
        searchParams.set('limit', String(params.limit))
      }

      return `${getMetaApiBaseUrl()}/act_${params.accountId.trim()}/campaigns?${searchParams.toString()}`
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
        output: { campaigns: [], totalCount: 0 },
        error: errorMessage,
      }
    }

    const items = data.data ?? []
    const campaigns = items.map((c: Record<string, unknown>) => ({
      id: (c.id as string) ?? '',
      name: (c.name as string) ?? '',
      status: (c.status as string) ?? '',
      objective: (c.objective as string) ?? null,
      dailyBudget: (c.daily_budget as string) ?? null,
      lifetimeBudget: (c.lifetime_budget as string) ?? null,
      createdTime: (c.created_time as string) ?? null,
      updatedTime: (c.updated_time as string) ?? null,
    }))

    return {
      success: true,
      output: {
        campaigns,
        totalCount: campaigns.length,
      },
    }
  },

  outputs: {
    campaigns: {
      type: 'array',
      description: 'List of campaigns in the account',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Campaign ID' },
          name: { type: 'string', description: 'Campaign name' },
          status: { type: 'string', description: 'Campaign status (ACTIVE, PAUSED, etc.)' },
          objective: { type: 'string', description: 'Campaign objective' },
          dailyBudget: { type: 'string', description: 'Daily budget in account currency cents' },
          lifetimeBudget: {
            type: 'string',
            description: 'Lifetime budget in account currency cents',
          },
          createdTime: { type: 'string', description: 'Campaign creation time (ISO 8601)' },
          updatedTime: { type: 'string', description: 'Campaign last update time (ISO 8601)' },
        },
      },
    },
    totalCount: {
      type: 'number',
      description: 'Total number of campaigns returned',
    },
  },
}
