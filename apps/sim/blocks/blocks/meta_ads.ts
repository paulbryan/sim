import { MetaAdsIcon } from '@/components/icons'
import { getScopesForService } from '@/lib/oauth/utils'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'

export const MetaAdsBlock: BlockConfig = {
  type: 'meta_ads',
  name: 'Meta Ads',
  description: 'Query campaigns, ad sets, ads, and performance insights',
  longDescription:
    'Connect to Meta Ads to view account info, list campaigns, ad sets, and ads, and get performance insights and metrics.',
  docsLink: 'https://docs.sim.ai/tools/meta_ads',
  category: 'tools',
  bgColor: '#1877F2',
  icon: MetaAdsIcon,
  authMode: AuthMode.OAuth,
  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Get Account Info', id: 'get_account' },
        { label: 'List Campaigns', id: 'list_campaigns' },
        { label: 'List Ad Sets', id: 'list_ad_sets' },
        { label: 'List Ads', id: 'list_ads' },
        { label: 'Get Insights', id: 'get_insights' },
      ],
      value: () => 'list_campaigns',
    },

    {
      id: 'credential',
      title: 'Meta Ads Account',
      type: 'oauth-input',
      canonicalParamId: 'oauthCredential',
      mode: 'basic',
      required: true,
      serviceId: 'meta-ads',
      requiredScopes: getScopesForService('meta-ads'),
      placeholder: 'Select Meta Ads account',
    },
    {
      id: 'manualCredential',
      title: 'Meta Ads Account',
      type: 'short-input',
      canonicalParamId: 'oauthCredential',
      mode: 'advanced',
      placeholder: 'Enter credential ID',
      required: true,
    },

    {
      id: 'accountSelector',
      title: 'Ad Account',
      type: 'project-selector',
      canonicalParamId: 'accountId',
      serviceId: 'meta-ads',
      selectorKey: 'meta-ads.accounts',
      placeholder: 'Select ad account',
      dependsOn: { any: ['credential', 'manualCredential'] },
      mode: 'basic',
      required: true,
    },
    {
      id: 'manualAccountId',
      title: 'Account ID',
      type: 'short-input',
      canonicalParamId: 'accountId',
      placeholder: 'Meta Ads account ID (numeric, without act_ prefix)',
      mode: 'advanced',
      required: true,
    },

    {
      id: 'campaignSelector',
      title: 'Campaign',
      type: 'project-selector',
      canonicalParamId: 'campaignId',
      serviceId: 'meta-ads',
      selectorKey: 'meta-ads.campaigns',
      placeholder: 'Select campaign',
      dependsOn: { all: ['credential'], any: ['accountSelector', 'manualAccountId'] },
      mode: 'basic',
      condition: {
        field: 'operation',
        value: ['list_ad_sets', 'list_ads', 'get_insights'],
      },
    },
    {
      id: 'manualCampaignId',
      title: 'Campaign ID',
      type: 'short-input',
      canonicalParamId: 'campaignId',
      placeholder: 'Campaign ID to filter by',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['list_ad_sets', 'list_ads', 'get_insights'],
      },
    },

    {
      id: 'adSetId',
      title: 'Ad Set ID',
      type: 'short-input',
      placeholder: 'Ad set ID to filter by',
      condition: {
        field: 'operation',
        value: ['list_ads', 'get_insights'],
      },
    },

    {
      id: 'level',
      title: 'Insights Level',
      type: 'dropdown',
      options: [
        { label: 'Account', id: 'account' },
        { label: 'Campaign', id: 'campaign' },
        { label: 'Ad Set', id: 'adset' },
        { label: 'Ad', id: 'ad' },
      ],
      condition: { field: 'operation', value: 'get_insights' },
      required: { field: 'operation', value: 'get_insights' },
      value: () => 'campaign',
    },

    {
      id: 'datePreset',
      title: 'Date Range',
      type: 'dropdown',
      options: [
        { label: 'Last 30 Days', id: 'last_30d' },
        { label: 'Last 7 Days', id: 'last_7d' },
        { label: 'Last 14 Days', id: 'last_14d' },
        { label: 'Last 28 Days', id: 'last_28d' },
        { label: 'Last 90 Days', id: 'last_90d' },
        { label: 'Maximum', id: 'maximum' },
        { label: 'Today', id: 'today' },
        { label: 'Yesterday', id: 'yesterday' },
        { label: 'This Month', id: 'this_month' },
        { label: 'Last Month', id: 'last_month' },
        { label: 'Custom', id: 'CUSTOM' },
      ],
      condition: { field: 'operation', value: 'get_insights' },
      value: () => 'last_30d',
    },

    {
      id: 'startDate',
      title: 'Start Date',
      type: 'short-input',
      placeholder: 'YYYY-MM-DD',
      condition: { field: 'datePreset', value: 'CUSTOM' },
      required: { field: 'datePreset', value: 'CUSTOM' },
      wandConfig: {
        enabled: true,
        prompt:
          'Generate a date in YYYY-MM-DD format. Return ONLY the date string - no explanations, no extra text.',
        generationType: 'timestamp',
      },
    },

    {
      id: 'endDate',
      title: 'End Date',
      type: 'short-input',
      placeholder: 'YYYY-MM-DD',
      condition: { field: 'datePreset', value: 'CUSTOM' },
      required: { field: 'datePreset', value: 'CUSTOM' },
      wandConfig: {
        enabled: true,
        prompt:
          'Generate a date in YYYY-MM-DD format. Return ONLY the date string - no explanations, no extra text.',
        generationType: 'timestamp',
      },
    },

    {
      id: 'status',
      title: 'Status Filter',
      type: 'dropdown',
      options: [
        { label: 'All', id: '' },
        { label: 'Active', id: 'ACTIVE' },
        { label: 'Paused', id: 'PAUSED' },
        { label: 'Archived', id: 'ARCHIVED' },
      ],
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['list_campaigns', 'list_ad_sets', 'list_ads'],
      },
    },

    {
      id: 'limit',
      title: 'Limit',
      type: 'short-input',
      placeholder: 'Maximum results to return',
      mode: 'advanced',
      condition: {
        field: 'operation',
        value: ['list_campaigns', 'list_ad_sets', 'list_ads', 'get_insights'],
      },
    },
  ],
  tools: {
    access: [
      'meta_ads_get_account',
      'meta_ads_list_campaigns',
      'meta_ads_list_ad_sets',
      'meta_ads_list_ads',
      'meta_ads_get_insights',
    ],
    config: {
      tool: (params) => `meta_ads_${params.operation}`,
      params: (params) => {
        const { oauthCredential, datePreset, limit, ...rest } = params

        const result: Record<string, unknown> = {
          ...rest,
          oauthCredential,
        }

        if (datePreset && datePreset !== 'CUSTOM') {
          result.datePreset = datePreset
        }

        if (limit !== undefined && limit !== '') {
          result.limit = Number(limit)
        }

        return result
      },
    },
  },
  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    oauthCredential: { type: 'string', description: 'Meta Ads OAuth credential' },
    accountId: { type: 'string', description: 'Meta Ads account ID' },
    campaignId: { type: 'string', description: 'Campaign ID to filter by' },
    adSetId: { type: 'string', description: 'Ad set ID to filter by' },
    level: { type: 'string', description: 'Insights aggregation level' },
    datePreset: { type: 'string', description: 'Date range for insights' },
    startDate: { type: 'string', description: 'Custom start date (YYYY-MM-DD)' },
    endDate: { type: 'string', description: 'Custom end date (YYYY-MM-DD)' },
    status: { type: 'string', description: 'Status filter' },
    limit: { type: 'number', description: 'Maximum results to return' },
  },
  outputs: {
    id: { type: 'string', description: 'Account ID (get_account)' },
    name: { type: 'string', description: 'Account name (get_account)' },
    accountStatus: { type: 'number', description: 'Account status code (get_account)' },
    currency: { type: 'string', description: 'Account currency (get_account)' },
    timezone: { type: 'string', description: 'Account timezone (get_account)' },
    amountSpent: { type: 'string', description: 'Total amount spent (get_account)' },
    spendCap: { type: 'string', description: 'Spending limit (get_account)' },
    businessCountryCode: { type: 'string', description: 'Country code (get_account)' },
    campaigns: { type: 'json', description: 'Campaign data (list_campaigns)' },
    adSets: { type: 'json', description: 'Ad set data (list_ad_sets)' },
    ads: { type: 'json', description: 'Ad data (list_ads)' },
    insights: { type: 'json', description: 'Performance insights (get_insights)' },
    totalCount: { type: 'number', description: 'Total number of results' },
  },
}
