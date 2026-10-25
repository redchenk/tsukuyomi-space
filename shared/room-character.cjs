'use strict';

// Compile only the bundled card. Evidence metadata is for editors, not dialogue.
// User knowledge, diary cards and examples never enter this instruction compiler.
const card = require('./room-character.json');
function corePrompt() {
    return card.sections.map(section => `【${section.title}】\n${section.text}`).join('\n\n');
}
module.exports = { card, corePrompt };
