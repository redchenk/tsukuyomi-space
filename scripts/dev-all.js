const { spawn } = require('node:child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const processes = [
    {
        name: 'api',
        color: '\x1b[36m',
        command: npmCommand,
        args: ['run', 'dev:api']
    },
    {
        name: 'web',
        color: '\x1b[35m',
        command: npmCommand,
        args: ['run', 'dev:web']
    }
];

let shuttingDown = false;
const children = [];

function prefixOutput(child, streamName, color, name) {
    const stream = streamName === 'stderr' ? process.stderr : process.stdout;
    let pending = '';

    child[streamName].on('data', (chunk) => {
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';

        for (const line of lines) {
            if (line.length) {
                stream.write(`${color}[${name}]\x1b[0m ${line}\n`);
            } else {
                stream.write('\n');
            }
        }
    });

    child[streamName].on('end', () => {
        if (pending) stream.write(`${color}[${name}]\x1b[0m ${pending}\n`);
    });
}

function stopAll(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const child of children) {
        if (!child.killed) {
            child.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
        }
    }

    setTimeout(() => process.exit(exitCode), 250).unref();
}

for (const item of processes) {
    const child = spawn(item.command, item.args, {
        env: {
            ...process.env,
            FORCE_COLOR: process.env.FORCE_COLOR || '1'
        },
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: false
    });

    children.push(child);
    prefixOutput(child, 'stdout', item.color, item.name);
    prefixOutput(child, 'stderr', item.color, item.name);

    child.on('exit', (code, signal) => {
        if (shuttingDown) return;
        const status = signal || code;
        process.stderr.write(`\x1b[31m[dev]\x1b[0m ${item.name} exited with ${status}\n`);
        stopAll(typeof code === 'number' ? code : 1);
    });

    child.on('error', (error) => {
        process.stderr.write(`\x1b[31m[dev]\x1b[0m failed to start ${item.name}: ${error.message}\n`);
        stopAll(1);
    });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
