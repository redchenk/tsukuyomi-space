import { apiUrl, getSession } from './client';
import { createAttachmentUploader, uploadRequest } from './attachment-upload.mjs';

let storage;
try { storage = window.localStorage; } catch (_) { /* Upload still works without persistence. */ }
const upload = createAttachmentUploader({ request: (method, path, options) => uploadRequest(apiUrl, method, path, options), storage });
export function uploadAttachment(file, options) {
  return upload(file, { ...options, accountRole: getSession()?.user?.role });
}
export { ATTACHMENT_ACCEPT, hasUnlimitedAttachmentSize } from './attachment-upload.mjs';
