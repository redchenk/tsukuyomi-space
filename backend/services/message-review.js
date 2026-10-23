const crypto = require('node:crypto');
const { reviewMessageContent } = require('./message-moderation');

function messageReviewDigest(message) {
    return crypto.createHash('sha256')
        .update(`${message?.id || ''}\0${message?.content || ''}\0${message?.updated_at || message?.created_at || ''}`)
        .digest('base64url');
}

function digestMatches(expected, actual) {
    const left = Buffer.from(String(expected || ''));
    const right = Buffer.from(String(actual || ''));
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function messageModerationView(message, settings) {
    const review = reviewMessageContent(message.content, settings);
    return {
        ...message,
        moderation: {
            reviewDigest: messageReviewDigest(message),
            blocked: !review.accepted,
            code: review.accepted ? '' : (review.code || 'UNSAFE_MESSAGE'),
            reasons: review.reviewReasons || [],
            matchedKeywords: review.matchedKeywords || [],
            externalHosts: review.externalHosts || []
        }
    };
}

module.exports = { messageReviewDigest, digestMatches, messageModerationView };
