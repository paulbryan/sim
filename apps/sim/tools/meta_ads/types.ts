import type { ToolResponse } from '@/tools/types'

const META_API_VERSION = 'v24.0'

export function getMetaApiBaseUrl(): string {
  return `https://graph.facebook.com/${META_API_VERSION}`
}

export interface MetaAdsBaseParams {
  accessToken: string
  accountId: string
}

export interface MetaAdsGetAccountParams extends MetaAdsBaseParams {}

export interface MetaAdsListCampaignsParams extends MetaAdsBaseParams {
  status?: string
  limit?: number
}

export interface MetaAdsListAdSetsParams extends MetaAdsBaseParams {
  campaignId?: string
  status?: string
  limit?: number
}

export interface MetaAdsListAdsParams extends MetaAdsBaseParams {
  campaignId?: string
  adSetId?: string
  status?: string
  limit?: number
}

export interface MetaAdsGetInsightsParams extends MetaAdsBaseParams {
  level: string
  campaignId?: string
  adSetId?: string
  datePreset?: string
  startDate?: string
  endDate?: string
  limit?: number
}

export interface MetaAdsAccount {
  id: string
  name: string
  accountStatus: number
  currency: string
  timezone: string
  amountSpent: string
  spendCap: string | null
  businessCountryCode: string | null
}

export interface MetaAdsGetAccountResponse extends ToolResponse {
  output: MetaAdsAccount
}

export interface MetaAdsCampaign {
  id: string
  name: string
  status: string
  objective: string | null
  dailyBudget: string | null
  lifetimeBudget: string | null
  createdTime: string | null
  updatedTime: string | null
}

export interface MetaAdsListCampaignsResponse extends ToolResponse {
  output: {
    campaigns: MetaAdsCampaign[]
    totalCount: number
  }
}

export interface MetaAdsAdSet {
  id: string
  name: string
  status: string
  campaignId: string
  dailyBudget: string | null
  lifetimeBudget: string | null
  startTime: string | null
  endTime: string | null
}

export interface MetaAdsListAdSetsResponse extends ToolResponse {
  output: {
    adSets: MetaAdsAdSet[]
    totalCount: number
  }
}

export interface MetaAdsAd {
  id: string
  name: string
  status: string
  adSetId: string | null
  campaignId: string | null
  createdTime: string | null
  updatedTime: string | null
}

export interface MetaAdsListAdsResponse extends ToolResponse {
  output: {
    ads: MetaAdsAd[]
    totalCount: number
  }
}

export interface MetaAdsInsight {
  accountId: string | null
  campaignId: string | null
  campaignName: string | null
  adSetId: string | null
  adSetName: string | null
  adId: string | null
  adName: string | null
  impressions: string
  clicks: string
  spend: string
  ctr: string | null
  cpc: string | null
  cpm: string | null
  reach: string | null
  frequency: string | null
  conversions: number
  dateStart: string
  dateStop: string
}

export interface MetaAdsGetInsightsResponse extends ToolResponse {
  output: {
    insights: MetaAdsInsight[]
    totalCount: number
  }
}
