const fs = require('fs');

function loadEnv(file) {
    if (!fs.existsSync(file)) return {};
    return Object.fromEntries(
        fs.readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && line.includes('='))
            .map(line => {
                const index = line.indexOf('=');
                return [line.slice(0, index), line.slice(index + 1)];
            })
    );
}

module.exports = {
    apps: [
        {
            name: 'tsukuyomi-api',
            script: 'backend/server.js',
            cwd: '/var/www/tsukuyomi-space',
            instances: 1,
            exec_mode: 'fork',
            env: loadEnv('/etc/tsukuyomi-space/tsukuyomi-space.env'),
            max_memory_restart: '300M',
            error_file: '/var/log/tsukuyomi-space/error.log',
            out_file: '/var/log/tsukuyomi-space/out.log',
            time: true
        }
    ]
};
