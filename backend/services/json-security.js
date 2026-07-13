const { visit } = require('jsonc-parser');

class DuplicateJsonKeyError extends SyntaxError {
    constructor() {
        super('请求 JSON 包含重复键');
        this.code = 'DUPLICATE_JSON_KEY';
        this.status = 400;
    }
}

function assertNoDuplicateJsonKeys(text) {
    if (!text || !String(text).trim()) return;

    const objectKeyStack = [];
    visit(String(text), {
        onObjectBegin() {
            objectKeyStack.push(new Set());
        },
        onObjectProperty(property) {
            const keys = objectKeyStack[objectKeyStack.length - 1];
            if (!keys) return;
            if (keys.has(property)) throw new DuplicateJsonKeyError();
            keys.add(property);
        },
        onObjectEnd() {
            objectKeyStack.pop();
        }
    }, {
        allowTrailingComma: false,
        disallowComments: true
    });
}

function rejectDuplicateJsonKeys(req, res, buffer, encoding) {
    assertNoDuplicateJsonKeys(buffer.toString(encoding || 'utf8'));
}

module.exports = {
    DuplicateJsonKeyError,
    assertNoDuplicateJsonKeys,
    rejectDuplicateJsonKeys
};
