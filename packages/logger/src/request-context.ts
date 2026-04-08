import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  requestId: string
  method?: string
  path?: string
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>()

/**
 * Runs a callback within a request context. All loggers called inside
 * the callback (and any async functions it awaits) will automatically
 * include the request context metadata in their output.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn)
}

/**
 * Returns the current request context, or undefined if called outside
 * of a `runWithRequestContext` scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore()
}
