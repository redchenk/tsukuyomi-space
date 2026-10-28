const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'room-relationship-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: directory, DB_PATH: path.join(directory, 'site.db'),
    JWT_SECRET: 'affinity-tests-secret-more-than-32-characters', ADMIN_PASSWORD: 'affinity-test-admin',
    ROOM_LOCAL_INTELLIGENCE: 'false', MEM0_TELEMETRY: 'false', ROOM_WEATHER_OFFLINE: 'true', REDIS_URL: '' });
const db = require('../backend/db');
const analysis = require('../backend/services/room-local-analysis');
const chat = require('../backend/repositories/room-chat-repository');
const memory = require('../backend/services/room-memory');
before(() => require('../backend/db/migrations/init').runMigrations());
after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
function user(id) { db.prepare("INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,'test','user')").run(id,id,id+'@example.test'); return id; }
function save(id, turnId, text, extra = {}) {
    const turn = { turnId, userMessage: text, assistantMessage: '我听见了，继续聊吧。', ...extra };
    let change;
    const rows = chat.saveTurn(id, turn, () => { change = analysis.recordConversation(id, turn); });
    return { rows, change, turn };
}
test('a saved conversation earns visible progress without memory or semantic services', () => {
    const id=user('basic');
    assert.equal(save(id,'one','今天想和你聊聊。').change.delta,1);
    const state=analysis.relationship(id);
    assert.equal(state.enabled,true); assert.equal(state.semanticEnabled,false);
    assert.equal(state.score,1); assert.equal(state.todayDelta,1); assert.equal(state.nextStage.remaining,29);
    assert.equal(state.records[0].reason,'日常交流');
    assert.equal(db.prepare('SELECT count(*) AS n FROM room_turn_analysis WHERE user_id=?').get(id).n,0);
});
test('retries, punctuation variants and regenerated replies cannot duplicate points', () => {
    const id=user('dedupe'), first=save(id,'one','你好，今天过得怎么样？');
    assert.equal(save(id,'one',first.turn.userMessage).rows.length,0);
    assert.equal(save(id,'two','你好今天过得怎么样').change.delta,0);
    const change=analysis.recordConversation(id,{...first.turn,assistantMessage:'另一份回复。'},{replace:true});
    assert.equal(change.delta,0);assert.equal(analysis.relationship(id).score,1);
});
test('save rollback rolls back the ledger and automatic openers earn nothing', () => {
    const id=user('atomic');
    assert.throws(()=>chat.saveTurn(id,{turnId:'failed',userMessage:'失败不应加分',assistantMessage:'回复'},()=>{analysis.recordConversation(id,{turnId:'failed',userMessage:'失败不应加分',assistantMessage:'回复'});throw Error('rollback');}));
    assert.equal(analysis.relationship(id).score,0);
    assert.equal(save(id,'opener','',{opener:true}).change,null);
    assert.equal(analysis.relationship(id).totalRecords,0);
});
test('daily cap, maximum score and account isolation are explicit', () => {
    const id=user('limits');user('other');
    for(let i=0;i<12;i++)save(id,'turn-'+i,'今天聊一个新话题 '+i);
    assert.equal(analysis.relationship(id).score,10);
    assert.equal(analysis.relationship(id).records[0].reason,'今日已达加分上限');
    assert.equal(analysis.relationship('other').score,0);
    db.prepare("UPDATE room_relationship_events SET day='2000-01-01' WHERE user_id=?").run(id);
    assert.equal(save(id,'tomorrow','新一天的不同话题').change.delta,1);
    db.prepare("UPDATE room_relationship_events SET delta=990,day='2000-01-01' WHERE user_id=? AND turn_id='turn-0'").run(id);
    assert.equal(analysis.relationship(id).score,1000);
    assert.equal(save(id,'max','还有一件想聊的事').change.reason,'好感度已满');
});
test('score requests and empty content are explained, but sadness never loses points', () => {
    const id=user('reasons');save(id,'first','今天心情有点难过。');
    assert.equal(analysis.relationship(id).score,1);
    assert.equal(save(id,'request','请把我的好感度加满').change.delta,0);
    assert.equal(save(id,'emoji','🙂🙂').change.delta,0);
    assert.equal(analysis.relationship(id).score,1);
});
test('semantic analysis preserves basic points and upgrades a turn once, within the cap', () => {
    const id=user('semantic');
    function apply(turnId,text,evidence) {
        const {turn}=save(id,turnId,text);
        const sources=memory.captureChatTurn(id,turn);
        const revision=require('node:crypto').createHash('sha256').update(JSON.stringify([text,turn.assistantMessage])).digest('hex');
        db.prepare('INSERT INTO room_turn_analysis(user_id,turn_id,revision,user_text,source_ids) VALUES(?,?,?,?,?)').run(id,turnId,revision,text,JSON.stringify(sources));
        const job=db.prepare('SELECT * FROM room_turn_analysis WHERE user_id=? AND turn_id=?').get(id,turnId);
        // A repeat arriving while the worker is queued cannot cancel the original award.
        assert.equal(save(id,turnId+'-repeat',text).change.delta,0);
        assert.equal(analysis.apply(job,analysis.validateEvidence(evidence,text)),true);
        assert.equal(analysis.apply(job,evidence),false);
    }
    apply('basic','今天就随便聊一聊。',{facts:[],relationship:'none',relationshipQuote:''});
    assert.equal(analysis.relationship(id).score,1);
    apply('trust','我相信你会陪我完成这个计划。',{facts:[],relationship:'trust',relationshipQuote:'我相信你会陪我完成这个计划。'});
    assert.equal(analysis.relationship(id).score,3);
    assert.equal(analysis.relationship(id).records.find(row=>row.turnId==='trust').delta,2);
});
test('editing older unscored history never grants retroactive points',()=>{
    const id=user('old');
    chat.saveTurn(id,{turnId:'old',userMessage:'旧记录',assistantMessage:'旧回复'});
    assert.equal(analysis.recordConversation(id,{turnId:'old',userMessage:'编辑旧记录',assistantMessage:'新回复'},{replace:true}),null);
    assert.equal(analysis.relationship(id).score,0);
});
