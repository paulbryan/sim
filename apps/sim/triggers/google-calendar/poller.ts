import { createLogger } from '@sim/logger'
import { GoogleCalendarIcon } from '@/components/icons'
import { isCredentialSetValue } from '@/executor/constants'
import { useSubBlockStore } from '@/stores/workflows/subblock/store'
import type { TriggerConfig } from '@/triggers/types'

const logger = createLogger('GoogleCalendarPollingTrigger')

const DEFAULT_CALENDARS = [{ id: 'primary', label: 'Primary Calendar' }]

export const googleCalendarPollingTrigger: TriggerConfig = {
  id: 'google_calendar_poller',
  name: 'Google Calendar Event Trigger',
  provider: 'google-calendar',
  description: 'Triggers when events are created, updated, or cancelled in Google Calendar',
  version: '1.0.0',
  icon: GoogleCalendarIcon,
  polling: true,

  subBlocks: [
    {
      id: 'triggerCredentials',
      title: 'Credentials',
      type: 'oauth-input',
      description: 'Connect your Google account to access Google Calendar.',
      serviceId: 'google-calendar',
      requiredScopes: [],
      required: true,
      mode: 'trigger',
      supportsCredentialSets: true,
    },
    {
      id: 'calendarId',
      title: 'Calendar',
      type: 'dropdown',
      placeholder: 'Select a calendar',
      description: 'The calendar to monitor for event changes.',
      required: false,
      defaultValue: 'primary',
      options: [],
      fetchOptions: async (blockId: string) => {
        const credentialId = useSubBlockStore.getState().getValue(blockId, 'triggerCredentials') as
          | string
          | null

        if (!credentialId) {
          throw new Error('No Google Calendar credential selected')
        }

        // Credential sets can't fetch user-specific calendars
        if (isCredentialSetValue(credentialId)) {
          return DEFAULT_CALENDARS
        }

        try {
          const response = await fetch(
            `/api/tools/google_calendar/calendars?credentialId=${credentialId}`
          )
          if (!response.ok) {
            throw new Error('Failed to fetch calendars')
          }
          const data = await response.json()
          if (data.calendars && Array.isArray(data.calendars)) {
            return data.calendars.map(
              (calendar: { id: string; summary: string; primary: boolean }) => ({
                id: calendar.id,
                label: calendar.primary ? `${calendar.summary} (Primary)` : calendar.summary,
              })
            )
          }
          return DEFAULT_CALENDARS
        } catch (error) {
          logger.error('Error fetching calendars:', error)
          throw error
        }
      },
      dependsOn: ['triggerCredentials'],
      mode: 'trigger',
    },
    {
      id: 'eventTypeFilter',
      title: 'Event Type',
      type: 'dropdown',
      options: [
        { id: '', label: 'All Events' },
        { id: 'created', label: 'Created' },
        { id: 'updated', label: 'Updated' },
        { id: 'cancelled', label: 'Cancelled' },
      ],
      defaultValue: '',
      description: 'Only trigger for specific event types. Defaults to all events.',
      required: false,
      mode: 'trigger',
    },
    {
      id: 'searchTerm',
      title: 'Search Term',
      type: 'short-input',
      placeholder: 'e.g., team meeting, standup',
      description:
        'Optional: Filter events by text match across title, description, location, and attendees.',
      required: false,
      mode: 'trigger',
    },
    {
      id: 'triggerSave',
      title: '',
      type: 'trigger-save',
      hideFromPreview: true,
      mode: 'trigger',
      triggerId: 'google_calendar_poller',
    },
    {
      id: 'triggerInstructions',
      title: 'Setup Instructions',
      hideFromPreview: true,
      type: 'text',
      defaultValue: [
        'Connect your Google account using OAuth credentials',
        'Select the calendar to monitor (defaults to your primary calendar)',
        'The system will automatically detect new, updated, and cancelled events',
      ]
        .map(
          (instruction, index) =>
            `<div class="mb-3"><strong>${index + 1}.</strong> ${instruction}</div>`
        )
        .join(''),
      mode: 'trigger',
    },
  ],

  outputs: {
    event: {
      id: {
        type: 'string',
        description: 'Calendar event ID',
      },
      status: {
        type: 'string',
        description: 'Event status (confirmed, tentative, cancelled)',
      },
      eventType: {
        type: 'string',
        description: 'Change type: "created", "updated", or "cancelled"',
      },
      summary: {
        type: 'string',
        description: 'Event title',
      },
      eventDescription: {
        type: 'string',
        description: 'Event description',
      },
      location: {
        type: 'string',
        description: 'Event location',
      },
      htmlLink: {
        type: 'string',
        description: 'Link to event in Google Calendar',
      },
      start: {
        type: 'json',
        description: 'Event start time',
      },
      end: {
        type: 'json',
        description: 'Event end time',
      },
      created: {
        type: 'string',
        description: 'Event creation time',
      },
      updated: {
        type: 'string',
        description: 'Event last updated time',
      },
      attendees: {
        type: 'json',
        description: 'Event attendees',
      },
      creator: {
        type: 'json',
        description: 'Event creator',
      },
      organizer: {
        type: 'json',
        description: 'Event organizer',
      },
    },
    calendarId: {
      type: 'string',
      description: 'Calendar ID',
    },
    timestamp: {
      type: 'string',
      description: 'Event processing timestamp in ISO format',
    },
  },
}
