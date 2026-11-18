const config = require('./config');

if (config.isProduction && process.platform !== 'win32') {
    process.umask(0o027);
}

const { createApp } = require('./app');

const app = createApp();

// An interrupted site-funded call must not be dispatched a second time on restart.
require('./db').prepare("UPDATE community_messages SET ai_status='failed' WHERE ai_status='pending'").run();
const server = app.listen(config.port, config.host, () => {
    require('./services/official-tts').start();
    require('./services/fushi-events').start();
    require('./services/indexnow').start();
    require('./services/mail-campaigns').start();
    console.log('Tsukuyomi Space API server ready');
});
require('./services/community-live').attach(server);
