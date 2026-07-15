const config = require('./config');

if (config.isProduction && process.platform !== 'win32') {
    process.umask(0o027);
}

const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, config.host, () => {
    console.log('Tsukuyomi Space API server ready');
});
