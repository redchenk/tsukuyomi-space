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
            uid: 'tsukuyomi',
            gid: 'www-data',
            instances: 1,
            exec_mode: 'fork',
            // Collect the JS heap before PM2's RSS guard terminates the process.
            // Leave room in RSS for SQLite, SDK buffers and other native memory.
            node_args: ['--max-old-space-size=192'],
            env: {
                ...loadEnv('/etc/tsukuyomi-space/tsukuyomi-space.env'),
                HOME: '/var/lib/tsukuyomi-space',
                MINIMAX_MCP_HOME: '/var/lib/tsukuyomi-space/mcp-home'
            },
            max_memory_restart: '384M',
            error_file: '/var/log/tsukuyomi-space/error.log',
            out_file: '/var/log/tsukuyomi-space/out.log',
            time: true
        }
    ]
};
