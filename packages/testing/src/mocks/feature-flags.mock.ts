export interface MockFeatureFlags {
  isProd: boolean
  isDev: boolean
  isTest: boolean
  isHosted: boolean
  isBillingEnabled: boolean
  isEmailVerificationEnabled: boolean
  isAuthDisabled: boolean
  isRegistrationDisabled: boolean
  isEmailPasswordEnabled: boolean
  isSignupEmailValidationEnabled: boolean
  isTriggerDevEnabled: boolean
  isSsoEnabled: boolean
  isCredentialSetsEnabled: boolean
  isAccessControlEnabled: boolean
  isOrganizationsEnabled: boolean
  isInboxEnabled: boolean
  isE2bEnabled: boolean
  isAzureConfigured: boolean
  isInvitationsDisabled: boolean
  isPublicApiDisabled: boolean
  isReactGrabEnabled: boolean
  isReactScanEnabled: boolean
  getAllowedIntegrationsFromEnv: () => string[] | null
  getAllowedMcpDomainsFromEnv: () => string[] | null
  getCostMultiplier: () => number
}

/**
 * Creates a mutable mock for the feature flags module.
 */
export function createFeatureFlagsMock(
  overrides: Partial<MockFeatureFlags> = {}
): MockFeatureFlags {
  return {
    isProd: false,
    isDev: false,
    isTest: true,
    isHosted: false,
    isBillingEnabled: false,
    isEmailVerificationEnabled: false,
    isAuthDisabled: false,
    isRegistrationDisabled: false,
    isEmailPasswordEnabled: true,
    isSignupEmailValidationEnabled: false,
    isTriggerDevEnabled: false,
    isSsoEnabled: false,
    isCredentialSetsEnabled: false,
    isAccessControlEnabled: false,
    isOrganizationsEnabled: false,
    isInboxEnabled: false,
    isE2bEnabled: false,
    isAzureConfigured: false,
    isInvitationsDisabled: false,
    isPublicApiDisabled: false,
    isReactGrabEnabled: false,
    isReactScanEnabled: false,
    getAllowedIntegrationsFromEnv: () => null,
    getAllowedMcpDomainsFromEnv: () => null,
    getCostMultiplier: () => 1,
    ...overrides,
  }
}

export const featureFlagsMock = createFeatureFlagsMock()
