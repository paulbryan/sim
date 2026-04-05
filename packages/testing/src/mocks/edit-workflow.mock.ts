const editWorkflowBlockConfigs: Record<
  string,
  {
    type: string
    name: string
    outputs: Record<string, unknown>
    subBlocks: { id: string; type: string }[]
  }
> = {
  condition: {
    type: 'condition',
    name: 'Condition',
    outputs: {},
    subBlocks: [{ id: 'conditions', type: 'condition-input' }],
  },
  agent: {
    type: 'agent',
    name: 'Agent',
    outputs: {
      content: { type: 'string', description: 'Default content output' },
    },
    subBlocks: [
      { id: 'systemPrompt', type: 'long-input' },
      { id: 'model', type: 'combobox' },
      { id: 'responseFormat', type: 'response-format' },
    ],
  },
  function: {
    type: 'function',
    name: 'Function',
    outputs: {},
    subBlocks: [
      { id: 'code', type: 'code' },
      { id: 'language', type: 'dropdown' },
    ],
  },
  router_v2: {
    type: 'router_v2',
    name: 'Router',
    outputs: {},
    subBlocks: [{ id: 'routes', type: 'router-input' }],
  },
}

export function createEditWorkflowRegistryMock(types?: string[]) {
  const enabledTypes = new Set(types ?? Object.keys(editWorkflowBlockConfigs))
  const blocks = Object.fromEntries(
    Object.entries(editWorkflowBlockConfigs).filter(([type]) => enabledTypes.has(type))
  )

  return {
    getAllBlocks: () => Object.values(blocks),
    getBlock: (type: string) => blocks[type],
  }
}
