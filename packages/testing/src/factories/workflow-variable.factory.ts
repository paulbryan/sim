import { nanoid } from 'nanoid'

export type WorkflowVariableType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'plain'

export interface WorkflowVariableFixture {
  id: string
  name: string
  type: WorkflowVariableType
  value: unknown
  workflowId?: string
  validationError?: string
}

export interface WorkflowVariableFactoryOptions {
  id?: string
  name?: string
  type?: WorkflowVariableType
  value?: unknown
  workflowId?: string
  validationError?: string
}

/**
 * Creates a workflow variable fixture with sensible defaults.
 */
export function createWorkflowVariable(
  options: WorkflowVariableFactoryOptions = {}
): WorkflowVariableFixture {
  const id = options.id ?? `var_${nanoid(8)}`

  return {
    id,
    name: options.name ?? `variable_${id.slice(0, 4)}`,
    type: options.type ?? 'string',
    value: options.value ?? '',
    workflowId: options.workflowId,
    validationError: options.validationError,
  }
}

/**
 * Creates a variables map keyed by variable id.
 */
export function createWorkflowVariablesMap(
  variables: WorkflowVariableFactoryOptions[] = []
): Record<string, WorkflowVariableFixture> {
  return Object.fromEntries(
    variables.map((variable) => {
      const fixture = createWorkflowVariable(variable)
      return [fixture.id, fixture]
    })
  )
}
