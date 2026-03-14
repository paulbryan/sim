import type { MetaAdsListAdsParams, MetaAdsListAdsResponse } from '@/tools/meta_ads/types'
import { getMetaApiBaseUrl, stripActPrefix } from '@/tools/meta_ads/types'
import type { ToolConfig } from '@/tools/types'

export const metaAdsListAdsTool: ToolConfig<MetaAdsListAdsParams, MetaAdsListAdsResponse> = {
  id: 'meta_ads_list_ads',
  name: 'List Meta Ads',
  description: 'List ads in a Meta Ads account, campaign, or ad set',
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
      description: 'Filter ads by campaign ID',
    },
    adSetId: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Filter ads by ad set ID',
    },
    status: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Filter by ad status (ACTIVE, PAUSED, ARCHIVED, DELETED)',
    },
    limit: {
      type: 'number',
      required: false,
      visibility: 'user-or-llm',
      description: 'Maximum number of ads to return',
    },
  },

  request: {
    url: (params) => {
      const fields = 'id,name,status,adset_id,campaign_id,created_time,updated_time'
      const searchParams = new URLSearchParams({ fields })

      if (params.status) {
        searchParams.set('effective_status', JSON.stringify([params.status]))
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
        parentId = `act_${stripActPrefix(params.accountId)}`
      }

      return `${getMetaApiBaseUrl()}/${parentId}/ads?${searchParams.toString()}`
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
        output: { ads: [], totalCount: 0 },
        error: errorMessage,
      }
    }

    const items = data.data ?? []
    const ads = items.map((a: Record<string, unknown>) => ({
      id: (a.id as string) ?? '',
      name: (a.name as string) ?? '',
      status: (a.status as string) ?? '',
      adSetId: (a.adset_id as string) ?? null,
      campaignId: (a.campaign_id as string) ?? null,
      createdTime: (a.created_time as string) ?? null,
      updatedTime: (a.updated_time as string) ?? null,
    }))

    return {
      success: true,
      output: {
        ads,
        totalCount: ads.length,
      },
    }
  },

  outputs: {
    ads: {
      type: 'array',
      description: 'List of ads',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Ad ID' },
          name: { type: 'string', description: 'Ad name' },
          status: { type: 'string', description: 'Ad status' },
          adSetId: { type: 'string', description: 'Parent ad set ID' },
          campaignId: { type: 'string', description: 'Parent campaign ID' },
          createdTime: { type: 'string', description: 'Ad creation time (ISO 8601)' },
          updatedTime: { type: 'string', description: 'Ad last update time (ISO 8601)' },
        },
      },
    },
    totalCount: {
      type: 'number',
      description: 'Number of ads returned in this response (may be limited by pagination)',
    },
  },
}
