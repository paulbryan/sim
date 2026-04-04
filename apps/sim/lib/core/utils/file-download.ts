import { createLogger } from '@sim/logger'

const logger = createLogger('FileDownload')

/**
 * Sanitizes a string for use as a file or path segment in exported assets.
 */
export function sanitizePathSegment(name: string): string {
  return name.replace(/[^a-z0-9-_]/gi, '-')
}

/**
 * Downloads a file to the user's device.
 * Throws if the browser cannot create or trigger the download.
 */
export function downloadFile(
  content: Blob | string,
  filename: string,
  mimeType = 'application/json'
): void {
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    logger.error('Failed to download file:', error)
    throw error
  }
}
