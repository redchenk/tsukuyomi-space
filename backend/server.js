const config = require('./config');
const db = require('./db');
const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, config.host, () => {
    console.log('Tsukuyomi Space API Server running on port', config.port);
    console.log('Health check: http://localhost:' + config.port + '/api/health');
    console.log('Articles API: http://localhost:' + config.port + '/api/articles');
    console.log('Auth API: http://localhost:' + config.port + '/api/auth/login');
    console.log('Chat API: http://localhost:' + config.port + '/api/chat');
    console.log('TTS API: http://localhost:' + config.port + '/api/tts');
    console.log('Database:', db.name || config.dbPath);
});
