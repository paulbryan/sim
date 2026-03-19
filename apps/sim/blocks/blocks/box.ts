import { BoxCompanyIcon } from '@/components/icons'
import { getScopesForService } from '@/lib/oauth/utils'
import type { BlockConfig } from '@/blocks/types'
import { AuthMode } from '@/blocks/types'
import { normalizeFileInput } from '@/blocks/utils'

export const BoxBlock: BlockConfig = {
  type: 'box',
  name: 'Box',
  description: 'Upload, download, search, and manage files and folders in Box',
  longDescription:
    'Integrate Box into your workflow to manage files and folders. Upload and download files, get file information, list folder contents, create and delete folders, copy files, search across your Box account, and update file metadata.',
  docsLink: 'https://docs.sim.ai/tools/box',
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
        { label: 'Upload File', id: 'upload_file' },
        { label: 'Download File', id: 'download_file' },
        { label: 'Get File Info', id: 'get_file_info' },
        { label: 'List Folder Items', id: 'list_folder_items' },
        { label: 'Create Folder', id: 'create_folder' },
        { label: 'Delete File', id: 'delete_file' },
        { label: 'Delete Folder', id: 'delete_folder' },
        { label: 'Copy File', id: 'copy_file' },
        { label: 'Search', id: 'search' },
        { label: 'Update File', id: 'update_file' },
      ],
      value: () => 'upload_file',
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

    // Upload File fields
    {
      id: 'uploadFile',
      title: 'File',
      type: 'file-upload',
      canonicalParamId: 'file',
      placeholder: 'Upload file to send to Box',
      mode: 'basic',
      multiple: false,
      required: { field: 'operation', value: 'upload_file' },
      condition: { field: 'operation', value: 'upload_file' },
    },
    {
      id: 'fileRef',
      title: 'File',
      type: 'short-input',
      canonicalParamId: 'file',
      placeholder: 'Reference file from previous blocks',
      mode: 'advanced',
      required: { field: 'operation', value: 'upload_file' },
      condition: { field: 'operation', value: 'upload_file' },
    },
    {
      id: 'parentFolderId',
      title: 'Parent Folder ID',
      type: 'short-input',
      placeholder: 'Folder ID (use "0" for root)',
      required: { field: 'operation', value: ['upload_file', 'create_folder', 'copy_file'] },
      condition: { field: 'operation', value: ['upload_file', 'create_folder', 'copy_file'] },
    },
    {
      id: 'uploadFileName',
      title: 'File Name',
      type: 'short-input',
      placeholder: 'Optional filename override',
      condition: { field: 'operation', value: 'upload_file' },
      mode: 'advanced',
    },

    // File ID field (shared by download, get info, delete, copy, update)
    {
      id: 'fileId',
      title: 'File ID',
      type: 'short-input',
      placeholder: 'Box file ID',
      required: {
        field: 'operation',
        value: ['download_file', 'get_file_info', 'delete_file', 'copy_file', 'update_file'],
      },
      condition: {
        field: 'operation',
        value: ['download_file', 'get_file_info', 'delete_file', 'copy_file', 'update_file'],
      },
    },

    // Folder ID field (shared by list, delete folder)
    {
      id: 'folderId',
      title: 'Folder ID',
      type: 'short-input',
      placeholder: 'Box folder ID (use "0" for root)',
      required: { field: 'operation', value: ['list_folder_items', 'delete_folder'] },
      condition: { field: 'operation', value: ['list_folder_items', 'delete_folder'] },
    },

    // Create Folder fields
    {
      id: 'folderName',
      title: 'Folder Name',
      type: 'short-input',
      placeholder: 'Name for the new folder',
      required: { field: 'operation', value: 'create_folder' },
      condition: { field: 'operation', value: 'create_folder' },
    },

    // Copy File fields
    {
      id: 'copyName',
      title: 'New Name',
      type: 'short-input',
      placeholder: 'Optional name for the copy',
      condition: { field: 'operation', value: 'copy_file' },
    },

    // Search fields
    {
      id: 'query',
      title: 'Search Query',
      type: 'short-input',
      placeholder: 'Search query string',
      required: { field: 'operation', value: 'search' },
      condition: { field: 'operation', value: 'search' },
    },
    {
      id: 'ancestorFolderId',
      title: 'Ancestor Folder ID',
      type: 'short-input',
      placeholder: 'Restrict search to a folder',
      condition: { field: 'operation', value: 'search' },
      mode: 'advanced',
    },
    {
      id: 'fileExtensions',
      title: 'File Extensions',
      type: 'short-input',
      placeholder: 'e.g., pdf,docx,xlsx',
      condition: { field: 'operation', value: 'search' },
      mode: 'advanced',
    },
    {
      id: 'contentType',
      title: 'Content Type',
      type: 'dropdown',
      options: [
        { label: 'All', id: '' },
        { label: 'Files', id: 'file' },
        { label: 'Folders', id: 'folder' },
        { label: 'Web Links', id: 'web_link' },
      ],
      value: () => '',
      condition: { field: 'operation', value: 'search' },
      mode: 'advanced',
    },

    // Update File fields
    {
      id: 'newName',
      title: 'New Name',
      type: 'short-input',
      placeholder: 'Rename the file',
      condition: { field: 'operation', value: 'update_file' },
    },
    {
      id: 'description',
      title: 'Description',
      type: 'short-input',
      placeholder: 'File description (max 256 chars)',
      condition: { field: 'operation', value: 'update_file' },
    },
    {
      id: 'moveToFolderId',
      title: 'Move to Folder ID',
      type: 'short-input',
      placeholder: 'Move file to this folder',
      condition: { field: 'operation', value: 'update_file' },
      mode: 'advanced',
    },
    {
      id: 'tags',
      title: 'Tags',
      type: 'short-input',
      placeholder: 'Comma-separated tags',
      condition: { field: 'operation', value: 'update_file' },
      mode: 'advanced',
    },

    // Delete Folder options
    {
      id: 'recursive',
      title: 'Delete Recursively',
      type: 'switch',
      condition: { field: 'operation', value: 'delete_folder' },
    },

    // Shared pagination fields
    {
      id: 'limit',
      title: 'Limit',
      type: 'short-input',
      placeholder: 'Max results per page',
      condition: { field: 'operation', value: ['list_folder_items', 'search'] },
      mode: 'advanced',
    },
    {
      id: 'offset',
      title: 'Offset',
      type: 'short-input',
      placeholder: 'Pagination offset',
      condition: { field: 'operation', value: ['list_folder_items', 'search'] },
      mode: 'advanced',
    },

    // List Folder sort options
    {
      id: 'sort',
      title: 'Sort By',
      type: 'dropdown',
      options: [
        { label: 'Default', id: '' },
        { label: 'ID', id: 'id' },
        { label: 'Name', id: 'name' },
        { label: 'Date', id: 'date' },
        { label: 'Size', id: 'size' },
      ],
      value: () => '',
      condition: { field: 'operation', value: 'list_folder_items' },
      mode: 'advanced',
    },
    {
      id: 'direction',
      title: 'Sort Direction',
      type: 'dropdown',
      options: [
        { label: 'Ascending', id: 'ASC' },
        { label: 'Descending', id: 'DESC' },
      ],
      value: () => 'ASC',
      condition: { field: 'operation', value: 'list_folder_items' },
      mode: 'advanced',
    },
  ],

  tools: {
    access: [
      'box_upload_file',
      'box_download_file',
      'box_get_file_info',
      'box_list_folder_items',
      'box_create_folder',
      'box_delete_file',
      'box_delete_folder',
      'box_copy_file',
      'box_search',
      'box_update_file',
    ],
    config: {
      tool: (params) => `box_${params.operation}`,
      params: (params) => {
        const normalizedFile = normalizeFileInput(params.file, { single: true })
        if (normalizedFile) {
          params.file = normalizedFile
        }
        const { credential, operation, ...rest } = params

        const baseParams: Record<string, unknown> = {
          accessToken: credential,
        }

        switch (operation) {
          case 'upload_file':
            baseParams.parentFolderId = rest.parentFolderId
            baseParams.file = rest.file
            if (rest.uploadFileName) baseParams.fileName = rest.uploadFileName
            break
          case 'download_file':
          case 'get_file_info':
          case 'delete_file':
            baseParams.fileId = rest.fileId
            break
          case 'list_folder_items':
            baseParams.folderId = rest.folderId
            if (rest.limit) baseParams.limit = Number(rest.limit)
            if (rest.offset) baseParams.offset = Number(rest.offset)
            if (rest.sort) baseParams.sort = rest.sort
            if (rest.direction) baseParams.direction = rest.direction
            break
          case 'create_folder':
            baseParams.name = rest.folderName
            baseParams.parentFolderId = rest.parentFolderId
            break
          case 'delete_folder':
            baseParams.folderId = rest.folderId
            if (rest.recursive !== undefined) baseParams.recursive = rest.recursive
            break
          case 'copy_file':
            baseParams.fileId = rest.fileId
            baseParams.parentFolderId = rest.parentFolderId
            if (rest.copyName) baseParams.name = rest.copyName
            break
          case 'search':
            baseParams.query = rest.query
            if (rest.limit) baseParams.limit = Number(rest.limit)
            if (rest.offset) baseParams.offset = Number(rest.offset)
            if (rest.ancestorFolderId) baseParams.ancestorFolderId = rest.ancestorFolderId
            if (rest.fileExtensions) baseParams.fileExtensions = rest.fileExtensions
            if (rest.contentType) baseParams.type = rest.contentType
            break
          case 'update_file':
            baseParams.fileId = rest.fileId
            if (rest.newName) baseParams.name = rest.newName
            if (rest.description !== undefined) baseParams.description = rest.description
            if (rest.moveToFolderId) baseParams.parentFolderId = rest.moveToFolderId
            if (rest.tags) baseParams.tags = rest.tags
            break
        }

        return baseParams
      },
    },
  },

  inputs: {
    operation: { type: 'string', description: 'Operation to perform' },
    credential: { type: 'string', description: 'Box OAuth credential' },
    file: { type: 'json', description: 'File to upload (canonical param)' },
    fileId: { type: 'string', description: 'Box file ID' },
    folderId: { type: 'string', description: 'Box folder ID' },
    parentFolderId: { type: 'string', description: 'Parent folder ID' },
    query: { type: 'string', description: 'Search query' },
  },

  outputs: {
    id: 'string',
    name: 'string',
    description: 'string',
    size: 'number',
    sha1: 'string',
    createdAt: 'string',
    modifiedAt: 'string',
    createdBy: 'json',
    modifiedBy: 'json',
    ownedBy: 'json',
    parentId: 'string',
    parentName: 'string',
    sharedLink: 'json',
    tags: 'json',
    commentCount: 'number',
    file: 'file',
    content: 'string',
    items: 'json',
    totalCount: 'number',
    offset: 'number',
    limit: 'number',
    results: 'json',
    deleted: 'boolean',
    message: 'string',
  },
}
