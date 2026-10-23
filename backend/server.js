const config = require('./config');

if (config.isProduction && process.platform !== 'win32') {
    process.umask(0o027);
}

const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, config.host, () => {
    require('./services/official-tts').start();
    require('./services/fushi-events').start();
    require('./services/indexnow').start();
    require('./services/mail-campaigns').start();
    console.log('Tsukuyomi Space API server ready');
});
