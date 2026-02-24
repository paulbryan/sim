# Copilot SSE Client Integration Guide

How to consume the copilot SSE stream from any client UI.

## Endpoint

```
POST /api/copilot/chat
Content-Type: application/json
```

### Request body

| Field         | Type     | Required | Description |
|---------------|----------|----------|-------------|
| `message`     | string   | yes      | User message |
| `workspaceId` | string   | yes*     | Workspace scope (required when no `workflowId`) |
| `workflowId`  | string   | no       | Workflow scope — when set, copilot operates on this workflow |
| `chatId`      | string   | no       | Continue an existing conversation |
| `createNewChat` | boolean | no      | Create a new persisted chat session |
| `stream`      | boolean  | no       | Default `true`. Set to get SSE stream |
| `model`       | string   | no       | Model ID (default: `claude-opus-4-5`) |
| `mode`        | string   | no       | `agent` / `ask` / `plan` |
| `headless`    | boolean  | no       | Skip interactive confirmation for all tools |

*Either `workflowId` or `workspaceId` must be provided. When only `workspaceId` is sent, the copilot runs in workspace mode (no workflow context).

### Response

`Content-Type: text/event-stream` — each line is `data: <JSON>\n\n`.

---

## SSE Event Types

Every event has a `type` field. The `state` field (when present) is the authoritative tool call lifecycle state set by the Go backend — clients should use it directly without deriving state from other fields.

### Session events

#### `chat_id`
Emitted once at the start. Store this to continue the conversation.
```json
{ "type": "chat_id", "chatId": "uuid" }
```

#### `title_updated`
Chat title was generated asynchronously.
```json
{ "type": "title_updated", "title": "My chat title" }
```

### Content events

#### `content`
Streamed text chunks from the assistant. Append to the current text block.
```json
{ "type": "content", "data": "Hello, " }
```
May also appear as `{ "type": "content", "content": "Hello, " }`. Check `data` first, fall back to `content`.

#### `reasoning`
Model thinking/reasoning content (if the model supports it). Render in a collapsible "thinking" block.
```json
{ "type": "reasoning", "content": "Let me think about...", "phase": "thinking" }
```

### Tool call lifecycle

Tools follow this lifecycle: `generating → pending|executing → success|error|rejected`.

The `state` field on each event tells you exactly what to render.

#### `tool_generating`
The model is streaming the tool call arguments. Create a placeholder block.
```json
{
  "type": "tool_generating",
  "state": "generating",
  "toolCallId": "toolu_abc123",
  "toolName": "edit_workflow",
  "ui": {
    "title": "Editing workflow",
    "icon": "pencil",
    "phaseLabel": "Build"
  }
}
```

#### `tool_call`
Arguments are finalized. The `state` tells you what to render:
- `"pending"` — user approval required. Show Allow/Skip buttons.
- `"executing"` — tool is running. Show spinner.

```json
{
  "type": "tool_call",
  "state": "pending",
  "toolCallId": "toolu_abc123",
  "toolName": "deploy_api",
  "data": { "id": "toolu_abc123", "name": "deploy_api", "arguments": { ... } },
  "ui": {
    "title": "Deploying API",
    "icon": "rocket",
    "requiresConfirmation": true,
    "clientExecutable": false,
    "hidden": false,
    "internal": false
  }
}
```

**Partial tool calls** (argument streaming): `tool_call` events with `data.partial: true` have no `state` field. Keep the current state, just update arguments for display.

#### `tool_result`
Tool execution completed.
```json
{
  "type": "tool_result",
  "state": "success",
  "toolCallId": "toolu_abc123",
  "success": true,
  "result": { ... }
}
```
`state` will be `"success"`, `"error"`, or `"rejected"`.

#### `tool_error`
Tool execution failed (error on the Sim server side, not from Go).
```json
{
  "type": "tool_error",
  "state": "error",
  "toolCallId": "toolu_abc123",
  "error": "Connection timeout"
}
```

### Subagent events

Subagents are specialized agents (build, deploy, auth, research, knowledge, table, etc.) that handle complex tasks. Their events are scoped by a parent tool call.

#### `subagent_start`
A subagent session started. All subsequent events with `"subagent": "<name>"` belong to this session.
```json
{
  "type": "subagent_start",
  "subagent": "build",
  "data": { "tool_call_id": "toolu_parent123" }
}
```
Render a label like "Building..." under the parent tool call.

#### `subagent_end`
Subagent session completed.
```json
{ "type": "subagent_end", "subagent": "build" }
```

#### Nested events
While a subagent is active, you'll receive `content`, `tool_generating`, `tool_call`, `tool_result`, etc. with `"subagent": "build"` on them. These are the subagent's own tool calls and text, nested under the parent.

### Terminal events

#### `done`
Stream completed. May include final content.
```json
{ "type": "done", "success": true, "content": "..." }
```

#### `error`
Fatal stream error.
```json
{ "type": "error", "error": "An unexpected error occurred" }
```

---

## UI Metadata (`ui` field)

Present on `tool_generating` and `tool_call` events. Use for rendering:

| Field                  | Type    | Description |
|------------------------|---------|-------------|
| `title`                | string  | Human-readable title (e.g., "Editing workflow") |
| `phaseLabel`           | string  | Category label (e.g., "Build", "Deploy") |
| `icon`                 | string  | Icon identifier |
| `requiresConfirmation` | boolean | If `true`, show approval UI (Allow/Skip) |
| `clientExecutable`     | boolean | If `true`, tool should execute on the client (e.g., `run_workflow`) |
| `internal`             | boolean | If `true`, this is an internal tool (subagent trigger). Skip rendering |
| `hidden`               | boolean | If `true`, don't render this tool call at all |

---

## Tool Call State Machine

```
tool_generating     →  state: "generating"    →  Show placeholder with spinner
tool_call           →  state: "pending"       →  Show Allow/Skip buttons
tool_call           →  state: "executing"     →  Show spinner
tool_result         →  state: "success"       →  Show checkmark
tool_result         →  state: "error"         →  Show error icon
tool_result         →  state: "rejected"      →  Show skipped/rejected
tool_error          →  state: "error"         →  Show error icon
```

Client-only states (not from SSE, managed locally):
- `background` — tool running in background (client UX decision)
- `aborted` — user aborted the stream
- `review` — client wants user to review result

---

## Handling User Confirmation

When a tool arrives with `state: "pending"`:

1. Render Allow/Skip buttons
2. On Allow: `POST /api/copilot/confirm` with `{ toolCallId, status: "accepted" }`
3. On Skip: `POST /api/copilot/confirm` with `{ toolCallId, status: "rejected" }`
4. Optimistically update to `executing` / `rejected`
5. The next SSE event (`tool_result`) will confirm the final state

For `clientExecutable` tools (e.g., `run_workflow`): after accepting, the client must execute the tool locally and report the result via `POST /api/copilot/confirm` with `{ toolCallId, status: "success"|"error", data: { ... } }`.

---

## Identifying Tool Categories

Use the `toolName` and `ui` metadata to determine what the tool does. Common patterns:

| Tool name pattern        | Category          | What to render |
|--------------------------|-------------------|----------------|
| `edit_workflow`          | Workflow editing  | Diff preview, block changes |
| `deploy_*`, `redeploy`  | Deployment        | Deploy status |
| `user_table`             | Table management  | Table creation/query results |
| `knowledge_base`         | Knowledge bases   | KB operations |
| `run_workflow`, `run_block` | Execution      | Execution results (client-executable) |
| `read`, `glob`, `grep`  | VFS               | File browser (often `hidden`) |
| `search_documentation`  | Research          | Doc search results |
| `navigate_ui`           | Navigation        | UI navigation command |

### Structured results

The `structured_result` event carries rich data that tools return. The `subagent_result` event similarly carries subagent completion data. Parse `result` / `data` to render tables, KB entries, deployment URLs, etc.

```json
{
  "type": "structured_result",
  "data": {
    "action": "table_created",
    "tables": [{ "id": "tbl_...", "name": "tasks" }],
    "success": true
  }
}
```

---

## Minimal Client Example

```typescript
const response = await fetch('/api/copilot/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Create a tasks table',
    workspaceId: 'ws_123',
    stream: true,
    createNewChat: true,
  }),
})

const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const event = JSON.parse(line.slice(6))

    switch (event.type) {
      case 'chat_id':
        // Store event.chatId for follow-up messages
        break
      case 'content':
        // Append event.data || event.content to text
        break
      case 'tool_generating':
      case 'tool_call':
        if (event.ui?.hidden) break
        // Create/update tool block using event.state
        // If event.state === 'pending', show approval buttons
        break
      case 'tool_result':
      case 'tool_error':
        // Update tool block with event.state
        break
      case 'subagent_start':
        // Show subagent activity label
        break
      case 'subagent_end':
        // Clear subagent label
        break
      case 'done':
        // Stream complete
        break
      case 'error':
        // Show error
        break
    }
  }
}
```

---

## Subagent Labels

Map subagent IDs to display labels:

| Subagent ID    | Display label |
|----------------|---------------|
| `build`        | Building |
| `deploy`       | Deploying |
| `auth`         | Connecting credentials |
| `research`     | Researching |
| `knowledge`    | Managing knowledge base |
| `table`        | Managing tables |
| `custom_tool`  | Creating tool |
| `superagent`   | Executing action |
| `plan`         | Planning |
| `debug`        | Debugging |
| `edit`         | Editing workflow |
