const tls = require('tls');
const config = require('../config');

const EMAIL_CODE_TTL_MS = config.emailCodeTtlMs;
const EMAIL_CODE_COOLDOWN_MS = config.emailCodeCooldownMs;

function encodeMimeWord(text) {
    return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function escapeMailText(text) {
    return String(text || '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function createSmtpClient() {
    const smtp = config.smtp;
    const socket = tls.connect({
        host: smtp.host,
        port: smtp.port,
        servername: smtp.host,
        rejectUnauthorized: true
    });
    socket.setEncoding('utf8');

    let buffer = '';
    const pending = [];

    socket.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, index + 1).replace(/\r?\n$/, '');
            buffer = buffer.slice(index + 1);
            const waiter = pending[0];
            if (waiter) waiter.lines.push(line);
            if (/^\d{3} /.test(line) && waiter) {
                pending.shift();
                const code = Number(line.slice(0, 3));
                if (waiter.expected.includes(code)) {
                    waiter.resolve(waiter.lines.join('\n'));
                } else {
                    waiter.reject(new Error(`SMTP ${code}: ${waiter.lines.join('\n')}`));
                }
            }
        }
    });

    const read = (expected) => new Promise((resolve, reject) => {
        pending.push({ expected, lines: [], resolve, reject });
    });

    const write = async (line, expected = [250]) => {
        socket.write(`${line}\r\n`);
        return read(expected);
    };

    return { socket, read, write };
}

async function sendVerificationEmail(email, code, purpose) {
    const smtp = config.smtp;
    if (!smtp.user || !smtp.pass) {
        throw new Error('SMTP credentials are not configured');
    }

    const client = createSmtpClient();
    const title = purpose === 'login' ? '登录验证码' : '注册验证码';
    const subject = `月读空间${title}`;
    const text = [
        `你的月读空间${title}是：${code}`,
        '',
        `验证码将在 ${Math.floor(EMAIL_CODE_TTL_MS / 60000)} 分钟后失效。`,
        '如果不是你本人操作，请忽略这封邮件。'
    ].join('\r\n');
    const message = [
        `From: ${encodeMimeWord(smtp.fromName)} <${smtp.user}>`,
        `To: <${email}>`,
        `Subject: ${encodeMimeWord(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        escapeMailText(text)
    ].join('\r\n');

    try {
        await client.read([220]);
        await client.write(`EHLO ${smtp.host}`, [250]);
        await client.write('AUTH LOGIN', [334]);
        await client.write(Buffer.from(smtp.user).toString('base64'), [334]);
        await client.write(Buffer.from(smtp.pass).toString('base64'), [235]);
        await client.write(`MAIL FROM:<${smtp.user}>`, [250]);
        await client.write(`RCPT TO:<${email}>`, [250, 251]);
        await client.write('DATA', [354]);
        client.socket.write(`${message}\r\n.\r\n`);
        await client.read([250]);
        await client.write('QUIT', [221]);
    } finally {
        client.socket.end();
    }
}

module.exports = {
    EMAIL_CODE_TTL_MS,
    EMAIL_CODE_COOLDOWN_MS,
    sendVerificationEmail
};
