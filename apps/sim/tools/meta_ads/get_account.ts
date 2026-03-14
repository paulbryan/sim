import type { MetaAdsGetAccountParams, MetaAdsGetAccountResponse } from '@/tools/meta_ads/types'
import { getMetaApiBaseUrl, stripActPrefix } from '@/tools/meta_ads/types'
import type { ToolConfig } from '@/tools/types'

export const metaAdsGetAccountTool: ToolConfig<MetaAdsGetAccountParams, MetaAdsGetAccountResponse> =
  {
    id: 'meta_ads_get_account',
    name: 'Get Meta Ads Account',
    description: 'Get information about a Meta Ads account',
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
    },

    request: {
      url: (params) => {
        const fields =
          'id,name,account_status,currency,timezone_name,amount_spent,spend_cap,business_country_code'
        return `${getMetaApiBaseUrl()}/act_${stripActPrefix(params.accountId)}?fields=${fields}`
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
          output: {
            id: '',
            name: '',
            accountStatus: 0,
            currency: '',
            timezone: '',
            amountSpent: '0',
            spendCap: null,
            businessCountryCode: null,
          },
          error: errorMessage,
        }
      }

      return {
        success: true,
        output: {
          id: data.id ?? '',
          name: data.name ?? '',
          accountStatus: data.account_status ?? 0,
          currency: data.currency ?? '',
          timezone: data.timezone_name ?? '',
          amountSpent: data.amount_spent ?? '0',
          spendCap: data.spend_cap ?? null,
          businessCountryCode: data.business_country_code ?? null,
        },
      }
    },

    outputs: {
      id: { type: 'string', description: 'Ad account ID' },
      name: { type: 'string', description: 'Ad account name' },
      accountStatus: { type: 'number', description: 'Account status code' },
      currency: { type: 'string', description: 'Account currency (e.g., USD)' },
      timezone: { type: 'string', description: 'Account timezone' },
      amountSpent: { type: 'string', description: 'Total amount spent' },
      spendCap: {
        type: 'string',
        description: 'Spending limit for the account',
        optional: true,
      },
      businessCountryCode: {
        type: 'string',
        description: 'Country code for the business',
        optional: true,
      },
    },
  }
