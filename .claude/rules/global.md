# Global Standards

## Logging
Import `createLogger` from `@sim/logger`. Use `logger.info`, `logger.warn`, `logger.error` instead of `console.log`. Inside API routes wrapped with `withRouteHandler`, loggers automatically include the request ID.

## API Route Handlers
All API route handlers must be wrapped with `withRouteHandler` from `@/lib/core/utils/with-route-handler`. Never export a bare `async function GET/POST/...` — always use `export const METHOD = withRouteHandler(...)`.

## Comments
Use TSDoc for documentation. No `====` separators. No non-TSDoc comments.

## Styling
Never update global styles. Keep all styling local to components.

## ID Generation
Never use `crypto.randomUUID()`, `nanoid`, or the `uuid` package directly. Use the utilities from `@/lib/core/utils/uuid`:

- `generateId()` — UUID v4, use by default
- `generateShortId(size?)` — short URL-safe ID (default 21 chars), for compact identifiers

Both use `crypto.getRandomValues()` under the hood and work in all contexts including non-secure (HTTP) browsers.

```typescript
// ✗ Bad
import { nanoid } from 'nanoid'
import { v4 as uuidv4 } from 'uuid'
const id = crypto.randomUUID()

// ✓ Good
import { generateId, generateShortId } from '@/lib/core/utils/uuid'
const uuid = generateId()
const shortId = generateShortId()
const tiny = generateShortId(8)
```

## Package Manager
Use `bun` and `bunx`, not `npm` and `npx`.
