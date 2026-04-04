/**
 * @vitest-environment node
 */
import { createEditWorkflowRegistryMock } from '@sim/testing'
import { describe, expect, it, vi } from 'vitest'
import { createBlockFromParams } from './builders'

vi.mock('@/blocks/registry', () => createEditWorkflowRegistryMock(['agent', 'condition']))

describe('createBlockFromParams', () => {
  it('derives agent outputs from responseFormat when outputs are not provided', () => {
    const block = createBlockFromParams('b-agent', {
      type: 'agent',
      name: 'Agent',
      inputs: {
        responseFormat: {
          type: 'object',
          properties: {
            answer: {
              type: 'string',
              description: 'Structured answer text',
            },
          },
          required: ['answer'],
        },
      },
      triggerMode: false,
    })

    expect(block.outputs.answer).toBeDefined()
    expect(block.outputs.answer.type).toBe('string')
  })

  it('preserves configured subblock types and normalizes condition branch ids', () => {
    const block = createBlockFromParams('condition-1', {
      type: 'condition',
      name: 'Condition 1',
      inputs: {
        conditions: JSON.stringify([
          { id: 'arbitrary-if', title: 'if', value: 'true' },
          { id: 'arbitrary-else', title: 'else', value: '' },
        ]),
      },
      triggerMode: false,
    })

    expect(block.subBlocks.conditions.type).toBe('condition-input')

    const parsed = JSON.parse(block.subBlocks.conditions.value)
    expect(parsed[0].id).toBe('condition-1-if')
    expect(parsed[1].id).toBe('condition-1-else')
  })
})
