/**
 * Mock implementations for common dependencies.
 *
 * @example
 * ```ts
 * import { createMockLogger, setupGlobalFetchMock, databaseMock } from '@sim/testing/mocks'
 *
 * // Mock the logger
 * vi.mock('@sim/logger', () => ({ createLogger: () => createMockLogger() }))
 *
 * // Mock fetch globally
 * setupGlobalFetchMock({ json: { success: true } })
 *
 * // Mock database
 * vi.mock('@sim/db', () => databaseMock)
 * ```
 */

export {
  mockCommonSchemas,
  mockConsoleLogger,
  mockDrizzleOrm,
  mockKnowledgeSchemas,
  setupCommonApiMocks,
} from './api.mock'
export { auditMock } from './audit.mock'
export {
  defaultMockUser,
  type MockAuthResult,
  type MockUser,
  mockAuth,
} from './auth.mock'
export {
  blocksMock,
  createMockGetBlock,
  createMockGetTool,
  mockBlockConfigs,
  mockToolConfigs,
  toolsUtilsMock,
} from './blocks.mock'
export {
  createMockDb,
  createMockDeleteChain,
  createMockSelectChain,
  createMockSql,
  createMockSqlOperators,
  createMockUpdateChain,
  databaseMock,
  drizzleOrmMock,
} from './database.mock'
export { createEditWorkflowRegistryMock } from './edit-workflow.mock'
export { createEnvMock, createMockGetEnv, defaultMockEnv, envMock } from './env.mock'
export {
  createFeatureFlagsMock,
  featureFlagsMock,
  type MockFeatureFlags,
} from './feature-flags.mock'
export {
  createMockFetch,
  createMockResponse,
  createMultiMockFetch,
  type MockFetchResponse,
  mockFetchError,
  mockNextFetchResponse,
  setupGlobalFetchMock,
} from './fetch.mock'
export { AuthTypeMock, type MockHybridAuthResult, mockHybridAuth } from './hybrid-auth.mock'
export { clearLoggerMocks, createMockLogger, getLoggerCalls, loggerMock } from './logger.mock'
export { clearRedisMocks, createMockRedis, type MockRedis } from './redis.mock'
export {
  asyncRouteParams,
  createMockFormDataRequest,
  createMockRequest,
  requestUtilsMock,
} from './request.mock'
export {
  createMockSocket,
  createMockSocketServer,
  type MockSocket,
  type MockSocketServer,
} from './socket.mock'
export { clearStorageMocks, createMockStorage, setupGlobalStorageMocks } from './storage.mock'
export { telemetryMock } from './telemetry.mock'
export { mockCryptoUuid, mockUuid } from './uuid.mock'
