const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const engine = require('../shared/room-dialogue.cjs');
const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/room-dialogue-cases.json'), 'utf8'));

function verifyCase(item) {
    const result = engine.plan({ ...item.input, now: suite.now });
    for (const [key, expected] of Object.entries(item.expect)) assert.deepEqual(result[key], expected, `${item.id}: ${key}`);
    for (const key of item.notes || []) assert.ok(result.prompt.includes(engine.policy.notes[key]), `${item.id}: ${key}`);
    return result;
}

if (require.main === module) {
    for (const item of suite.cases) verifyCase(item);
    console.log(`${suite.cases.length} dialogue scenarios passed; ${suite.cases.filter(c => c.input.history?.length >= 10).length} contain 5+ completed turns. No model requests.`);
}
module.exports = { suite, verifyCase };
