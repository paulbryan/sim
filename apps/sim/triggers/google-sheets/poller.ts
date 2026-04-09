import { createLogger } from '@sim/logger'
import { GoogleSheetsIcon } from '@/components/icons'
import { isCredentialSetValue } from '@/executor/constants'
import { useSubBlockStore } from '@/stores/workflows/subblock/store'
import type { TriggerConfig } from '@/triggers/types'

const logger = createLogger('GoogleSheetsPollingTrigger')

export const googleSheetsPollingTrigger: TriggerConfig = {
  id: 'google_sheets_poller',
  name: 'Google Sheets New Row Trigger',
  provider: 'google-sheets',
  description: 'Triggers when new rows are added to a Google Sheet',
  version: '1.0.0',
  icon: GoogleSheetsIcon,
  polling: true,

  subBlocks: [
    {
      id: 'triggerCredentials',
      title: 'Credentials',
      type: 'oauth-input',
      description: 'Connect your Google account to access Google Sheets.',
      serviceId: 'google-sheets',
      requiredScopes: [],
      required: true,
      mode: 'trigger',
      supportsCredentialSets: true,
    },
    {
      id: 'spreadsheetId',
      title: 'Spreadsheet ID',
      type: 'short-input',
      placeholder: 'e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms',
      description:
        'The spreadsheet ID from the URL: docs.google.com/spreadsheets/d/{spreadsheetId}/edit',
      required: true,
      mode: 'trigger',
    },
    {
      id: 'sheetName',
      title: 'Sheet Tab',
      type: 'dropdown',
      placeholder: 'Select a sheet tab',
      description: 'The sheet tab to monitor for new rows.',
      required: true,
      options: [],
      fetchOptions: async (blockId: string) => {
        const subBlockStore = useSubBlockStore.getState()
        const credentialId = subBlockStore.getValue(blockId, 'triggerCredentials') as string | null
        const spreadsheetId = subBlockStore.getValue(blockId, 'spreadsheetId') as string | null

        if (!credentialId) {
          throw new Error('No Google Sheets credential selected')
        }
        if (!spreadsheetId) {
          throw new Error('No spreadsheet ID provided')
        }

        // Credential sets can't fetch user-specific data; return empty to allow manual entry
        if (isCredentialSetValue(credentialId)) {
          return []
        }

        try {
          const response = await fetch(
            `/api/tools/google_sheets/sheets?credentialId=${credentialId}&spreadsheetId=${spreadsheetId}`
          )
          if (!response.ok) {
            throw new Error('Failed to fetch sheet tabs')
          }
          const data = await response.json()
          if (data.sheets && Array.isArray(data.sheets)) {
            return data.sheets.map((sheet: { id: string; name: string }) => ({
              id: sheet.id,
              label: sheet.name,
            }))
          }
          return []
        } catch (error) {
          logger.error('Error fetching sheet tabs:', error)
          throw error
        }
      },
      dependsOn: ['triggerCredentials', 'spreadsheetId'],
      mode: 'trigger',
    },
    {
      id: 'includeHeaders',
      title: 'Map Row Values to Headers',
      type: 'switch',
      defaultValue: true,
      description:
        'When enabled, each row is returned as a key-value object mapped to column headers from row 1.',
      required: false,
      mode: 'trigger',
    },
    {
      id: 'valueRenderOption',
      title: 'Value Render',
      type: 'dropdown',
      options: [
        { id: 'FORMATTED_VALUE', label: 'Formatted Value' },
        { id: 'UNFORMATTED_VALUE', label: 'Unformatted Value' },
        { id: 'FORMULA', label: 'Formula' },
      ],
      defaultValue: 'FORMATTED_VALUE',
      description:
        'How values are rendered. Formatted returns display strings, Unformatted returns raw numbers/booleans, Formula returns the formula text.',
      required: false,
      mode: 'trigger',
    },
    {
      id: 'dateTimeRenderOption',
      title: 'Date/Time Render',
      type: 'dropdown',
      options: [
        { id: 'SERIAL_NUMBER', label: 'Serial Number' },
        { id: 'FORMATTED_STRING', label: 'Formatted String' },
      ],
      defaultValue: 'SERIAL_NUMBER',
      description:
        'How dates and times are rendered. Only applies when Value Render is not "Formatted Value".',
      required: false,
      mode: 'trigger',
    },
    {
      id: 'triggerSave',
      title: '',
      type: 'trigger-save',
      hideFromPreview: true,
      mode: 'trigger',
      triggerId: 'google_sheets_poller',
    },
    {
      id: 'triggerInstructions',
      title: 'Setup Instructions',
      hideFromPreview: true,
      type: 'text',
      defaultValue: [
        'Connect your Google account using OAuth credentials',
        'Enter the Spreadsheet ID from your Google Sheets URL',
        'Select the sheet tab to monitor',
        'The system will automatically detect new rows appended to the sheet',
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
    row: {
      type: 'json',
      description: 'Row data mapped to column headers (when header mapping is enabled)',
    },
    rawRow: {
      type: 'json',
      description: 'Raw row values as an array',
    },
    headers: {
      type: 'json',
      description: 'Column headers from row 1',
    },
    rowNumber: {
      type: 'number',
      description: 'The 1-based row number of the new row',
    },
    spreadsheetId: {
      type: 'string',
      description: 'The spreadsheet ID',
    },
    sheetName: {
      type: 'string',
      description: 'The sheet tab name',
    },
    timestamp: {
      type: 'string',
      description: 'Event timestamp in ISO format',
    },
  },
}
