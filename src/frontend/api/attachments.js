import { apiUrl } from './client';
import { createAttachmentUploader, uploadRequest } from './attachment-upload.mjs';

let storage;
try { storage = window.localStorage; } catch (_) { /* Upload still works without persistence. */ }
export const uploadAttachment = createAttachmentUploader({ request: (method, path, options) => uploadRequest(apiUrl, method, path, options), storage });
export { ATTACHMENT_ACCEPT } from './attachment-upload.mjs';
