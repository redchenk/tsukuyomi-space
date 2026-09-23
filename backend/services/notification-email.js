const userRepository = require('../repositories/user-repository');
const { isEmail, publicEmail } = require('../validators');
const { isEmailNotificationEnabled } = require('./notification-settings');
const { sendNotificationEmail } = require('./mailer');

const SETTING_FOR_TYPE = Object.freeze({
    reply: 'emailNotifyReplies',
    like: 'emailNotifyLikes'
});

function notificationEmailRecipient(userId, type, actorId) {
    if (!userId || userId === actorId || !SETTING_FOR_TYPE[type]) return '';
    if (!isEmailNotificationEnabled(SETTING_FOR_TYPE[type])) return '';
    const user = userRepository.findUserById(userId);
    const email = publicEmail(user?.email);
    return isEmail(email) ? email : '';
}

function queueNotificationEmail({ userId, actorId, type, title, content, link, actorName }, { send = sendNotificationEmail, schedule = setImmediate } = {}) {
    let email = '';
    try {
        email = notificationEmailRecipient(userId, type, actorId);
    } catch (error) {
        console.error('Notification email eligibility failed:', error.message);
        return false;
    }
    if (!email) return false;
    schedule(() => {
        Promise.resolve().then(() => send(email, { type, title, content, link, actorName })).catch((error) => {
            console.error('Notification email send failed:', error.message);
        });
    });
    return true;
}

module.exports = { notificationEmailRecipient, queueNotificationEmail };
