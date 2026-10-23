const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const filename = path.resolve(__dirname, '../backend/services/mailer.js');
const localRequire = createRequire(filename);
function transport(overrides = {}) {
    const socket = new EventEmitter(), commands = [];
    let index = 0, ended = false;
    const replies = [250,334,334,235,250,250,354,250,221];
    socket.setEncoding = socket.setTimeout = () => {};
    socket.end = () => { ended = true; };
    socket.destroy = () => socket.emit('close');
    socket.write = command => {
        commands.push(command);
        const response = Object.hasOwn(overrides,index) ? overrides[index] : replies[index]; index++;
        queueMicrotask(() => response === 'close' ? socket.emit('close') : socket.emit('data', `${response} fixture\r\n`));
    };
    const module = {exports:{}};
    const require = name => name === 'tls' ? {connect:() => {queueMicrotask(()=>socket.emit('data','220 fixture\r\n'));return socket;}}
        : name === '../config' ? {smtp:{user:'sender@example.test',pass:'fixture-only',host:'smtp.example.test',port:465},publicSiteUrl:'https://yachiyo.hk'} : localRequire(name);
    vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require,module,exports:module.exports,Buffer,console},{filename});
    return {send:()=>module.exports.sendPlayTestInvitation('recipient@example.test'),commands,ended:()=>ended};
}
test('SMTP acceptance remains successful when QUIT is rejected or the connection closes',async()=>{
    for(const quit of [221,421,'close']) {
        const fixture=transport({8:quit}); await fixture.send();
        assert.equal(fixture.commands.filter(x=>x==='DATA\r\n').length,1);
        assert.equal(fixture.commands.at(-1),'QUIT\r\n'); assert.equal(fixture.ended(),true);
    }
});
test('SMTP recipient or DATA rejection still fails, and missing DATA acceptance stays uncertain',async()=>{
    for(const override of [{5:550},{7:451},{7:'close'}]) {
        const fixture=transport(override); await assert.rejects(fixture.send(),/SMTP (550|451|connection closed)/);
        assert.equal(fixture.commands.includes('QUIT\r\n'),false); assert.equal(fixture.ended(),true);
    }
});
