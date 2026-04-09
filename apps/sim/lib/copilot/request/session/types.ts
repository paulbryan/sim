import type {
  MothershipStreamV1EventEnvelope,
  MothershipStreamV1EventType,
  MothershipStreamV1StreamScope,
} from '@/lib/copilot/generated/mothership-stream-v1'

export interface StreamEvent {
  type: MothershipStreamV1EventType
  payload: Record<string, unknown>
  scope?: MothershipStreamV1StreamScope
}

export interface StreamBatchEvent {
  eventId: number
  streamId: string
  event: MothershipStreamV1EventEnvelope
}

export function toStreamBatchEvent(envelope: MothershipStreamV1EventEnvelope): StreamBatchEvent {
  return {
    eventId: envelope.seq,
    streamId: envelope.stream.streamId,
    event: envelope,
  }
}
