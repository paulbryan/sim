import { BoxCompanyIcon } from '@/components/icons'
import { getScopesForService } from '@/lib/oauth/utils'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'

export const BoxSignBlock: BlockConfig = {
  type: 'box_sign',
  name: 'Box Sign',
  description:
    'Send documents for e-signature, check status, and manage sign requests with Box Sign',
  longDescription:
    'Integrate Box Sign into your workflow to send documents for e-signature. Create sign requests with multiple signers, track signing status, list all requests, cancel pending requests, and resend reminders. Ideal for offer letters, contracts, and other documents requiring signatures.',
  docsLink: 'https://docs.sim.ai/tools/box_sign',
  category: 'tools',
  bgColor: '#0061D5',
  icon: BoxCompanyIcon,
  authMode: AuthMode.OAuth,

  subBlocks: [
    {
      id: 'operation',
      title: 'Operation',
      type: 'dropdown',
      options: [
        { label: 'Create Sign Request', id: 'create_request' },
        { label: 'Get Sign Request', id: 'get_request' },
        { label: 'List Sign Requests', id: 'list_requests' },
        { label: 'Cancel Sign Request', id: 'cancel_request' },
        { label: 'Resend Sign Request', id: 'resend_request' },
      ],
      value: () => 'create_request',
    },
    {
      id: 'credential',
      title: 'Box Account',
      type: 'oauth-input',
      serviceId: 'box',
      requiredScopes: getScopesForService('box'),
      placeholder: 'Select Box account',
      required: true,
    },

    // Create Sign Request fields
    {
      id: 'sourceFileIds',
      title: 'Source File IDs',
      type: 'short-input',
      placeholder: 'Comma-separated Box file IDs (e.g., 12345,67890)',
      required: { field: 'operation', value: 'create_request' },
      condition: { field: 'operation', value: 'create_request' },
    },
    {
      id: 'signerEmail',
      title: 'Signer Email',
      type: 'short-input',
      placeholder: 'Primary signer email address',
      required: { field: 'operation', value: 'create_request' },
      condition: { field: 'operation', value: 'create_request' },
    },
    {
      id: 'signerRole',
      title: 'Signer Role',
      type: 'dropdown',
      options: [
        { label: 'Signer', id: 'signer' },
        { label: 'Approver', id: 'approver' },
        { label: 'Final Copy Reader', id: 'final_copy_reader' },
      ],
      value: () => 'signer',
      condition: { field: 'operation', value: 'create_request' },
    },
    {
      id: 'emailSubject',
      title: 'Email Subject',
      type: 'short-input',
      placeholder: 'Custom email subject line',
      condition: { field: 'operation', value: 'create_request' },
    },
    {
      id: 'emailMessage',
      title: 'Email Message',
      type: 'long-input',
      placeholder: 'Custom message in the signing email',
      condition: { field: 'operation', value: 'create_request' },
    },
    {
      id: 'name',
      title: 'Request Name',
      type: 'short-input',
      placeholder: 'Name for this sign request',
      condition: { field: 'operation', value: 'create_request' },
    },
    {
      id: 'additionalSigners',
      title: 'Additional Signers',
      type: 'long-input',
      placeholder: '[{"email":"user@example.com","role":"signer"}]',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'parentFolderId',
      title: 'Destination Folder ID',
      type: 'short-input',
      placeholder: 'Box folder ID for signed documents',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'daysValid',
      title: 'Days Valid',
      type: 'short-input',
      placeholder: 'Number of days before expiry (0-730)',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'areRemindersEnabled',
      title: 'Enable Reminders',
      type: 'switch',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'areTextSignaturesEnabled',
      title: 'Allow Text Signatures',
      type: 'switch',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'signatureColor',
      title: 'Signature Color',
      type: 'dropdown',
      options: [
        { label: 'Blue', id: 'blue' },
        { label: 'Black', id: 'black' },
        { label: 'Red', id: 'red' },
      ],
      value: () => 'blue',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'redirectUrl',
      title: 'Redirect URL',
      type: 'short-input',
      placeholder: 'URL to redirect after signing',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'declinedRedirectUrl',
      title: 'Declined Redirect URL',
      type: 'short-input',
      placeholder: 'URL to redirect after declining',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'isDocumentPreparationNeeded',
      title: 'Document Preparation Needed',
      type: 'switch',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },
    {
      id: 'externalId',
      title: 'External ID',
      type: 'short-input',
      placeholder: 'External system reference ID',
      condition: { field: 'operation', value: 'create_request' },
      mode: 'advanced',
    },

    // Get / Cancel / Resend fields
    {
      id: 'signRequestId',
      title: 'Sign Request ID',
      type: 'short-input',
      placeholder: 'Box Sign request ID',
      required: { field: 'operation', value: ['get_request', 'cancel_request', 'resend_request'] },
      condition: {
        field: 'operation',
        value: ['get_request', 'cancel_request', 'resend_request'],
      },
    },

    // List fields
    {
      id: 'limit',
      title: 'Limit',
      type: 'short-input',
      placeholder: 'Max results (default: 100, max: 1000)',
      condition: { field: 'operation', value: 'list_requests' },
      mode: 'advanced',
    },
    {
      id: 'marker',
      title: 'Pagination Marker',
      type: 'short-input',
      placeholder: 'Marker from previous response',
      condition: { field: 'operation', value: 'list_requests' },
      mode: 'advanced',
    },
  ],

  tools: {
    access: [
      'box_sign_create_request',
      'box_sign_get_request',
      'box_sign_list_requests',
      'box_sign_cancel_request',
      'box_sign_resend_request',
    ],
    config: {
      tool: (params) => `box_sign_${params.operation}`,
      params: (params) => {
        const { credential, operation, ...rest } = params

        const baseParams: Record<string, unknown> = {
          accessToken: credential,
        }

        switch (operation) {
          case 'create_request':
            baseParams.sourceFileIds = rest.sourceFileIds
            baseParams.signerEmail = rest.signerEmail
            if (rest.signerRole) baseParams.signerRole = rest.signerRole
            if (rest.additionalSigners) baseParams.additionalSigners = rest.additionalSigners
            if (rest.parentFolderId) baseParams.parentFolderId = rest.parentFolderId
            if (rest.emailSubject) baseParams.emailSubject = rest.emailSubject
            if (rest.emailMessage) baseParams.emailMessage = rest.emailMessage
            if (rest.name) baseParams.name = rest.name
            if (rest.daysValid) baseParams.daysValid = Number(rest.daysValid)
            if (rest.areRemindersEnabled !== undefined)
              baseParams.areRemindersEnabled = rest.areRemindersEnabled
            if (rest.areTextSignaturesEnabled !== undefined)
              baseParams.areTextSignaturesEnabled = rest.areTextSignaturesEnabled
            if (rest.signatureColor) baseParams.signatureColor = rest.signatureColor
            if (rest.redirectUrl) baseParams.redirectUrl = rest.redirectUrl
            if (rest.declinedRedirectUrl) baseParams.declinedRedirectUrl = rest.declinedRedirectUrl
            if (rest.isDocumentPreparationNeeded !== undefined)
              baseParams.isDocumentPreparationNeeded = rest.isDocumentPreparationNeeded
            if (rest.externalId) baseParams.externalId = rest.externalId
            break
          case 'get_request':
          case 'resend_request':
            baseParams.signRequestId = rest.signRequestId
            break
          case 'cancel_request':
            baseParams.signRequestId = rest.signRequestId
            break
          case 'list_requests':
            if (rest.limit) baseParams.limit = Number(rest.limit)
            if (rest.marker) baseParams.marker = rest.marker
            break
        }

        return baseParams
      },
    },
  },

  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    credential: { type: 'string', description: 'Box OAuth credential' },
    sourceFileIds: { type: 'string', description: 'Comma-separated Box file IDs' },
    signerEmail: { type: 'string', description: 'Primary signer email address' },
    signRequestId: { type: 'string', description: 'Sign request ID' },
  },

  outputs: {
    id: 'string',
    status: 'string',
    name: 'string',
    shortId: 'string',
    signers: 'json',
    sourceFiles: 'json',
    emailSubject: 'string',
    emailMessage: 'string',
    daysValid: 'number',
    createdAt: 'string',
    autoExpireAt: 'string',
    prepareUrl: 'string',
    senderEmail: 'string',
    signRequests: 'json',
    count: 'number',
    nextMarker: 'string',
    message: 'string',
  },
}
