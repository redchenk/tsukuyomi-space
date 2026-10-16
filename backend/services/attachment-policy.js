const authRepository = require('../repositories/auth-repository');
const { MAX_USER_UPLOAD_BYTES, validateUploadSize } = require('./file-security');

function maxUploadBytesForOwner(ownerId) {
    // Read the current role for every operation, including resumed uploads.
    // Never take an exemption from request bodies or persisted upload sessions.
    const role = ownerId ? authRepository.findUserById(ownerId)?.role : null;
    return role === 'admin' || role === 'super_admin' ? Infinity : MAX_USER_UPLOAD_BYTES;
}

function validateUploadSizeForOwner(ownerId, size) {
    validateUploadSize(size, maxUploadBytesForOwner(ownerId));
}

module.exports = { maxUploadBytesForOwner, validateUploadSizeForOwner };
