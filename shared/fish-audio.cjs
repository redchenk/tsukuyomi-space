'use strict';

const endpoint = 'https://api.fish.audio/v1/tts';
const yachiyoVoice = 'a746d80afdb5451ca44c63401c001c9b';
const models = ['s2.1-pro', 'drama-3', 's2-pro', 's2.1-pro-free', 's1'];
const styles = {
    happy: '开心', calm: '平静', excited: '兴奋', sad: '难过', angry: '生气', surprised: '惊讶',
    embarrassed: '害羞', proud: '得意', curious: '好奇', empathetic: '体贴', whispering: '轻声'
};
const expressions = {
    closed_smile: 'happy', closed_eyes: 'calm', shy: 'embarrassed', smug: 'proud', fire: 'excited',
    tear_drop: 'sad', watery_eyes: 'sad', crying: 'sad', puff: 'angry', tongue: 'happy', dizzy: 'surprised'
};
function validStyle(style) { return typeof style === 'string' && Object.hasOwn(styles, style); }
function resolveStyle(setting = 'auto', emotion) {
    if (setting !== 'auto') return validStyle(setting) ? setting : '';
    return validStyle(emotion) ? emotion : Object.hasOwn(expressions, emotion) ? expressions[emotion] : '';
}
function validate(model, voice) {
    if (!models.includes(model)) throw Object.assign(new Error('请选择支持情感提示的 Fish Audio 模型'), { status: 400 });
    if (voice && !/^[0-9a-f]{32}$/i.test(voice)) throw Object.assign(new Error('Fish Audio 音色 ID 应为 32 位十六进制字符'), { status: 400 });
}
function request(text, { apiKey, model = models[0], voice = '', emotion = '' }) {
    validate(model, voice);
    if (!apiKey?.trim()) throw Object.assign(new Error('请填写 Fish Audio API 密钥'), { status: 400 });
    const cue = validStyle(emotion) ? (model === 's1' ? '(' + emotion + ') ' : '[' + emotion + '] ') : '';
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey.trim(), model },
        body: JSON.stringify({ text: cue + text,
            ...(voice ? { reference_id: voice } : {}), format: 'mp3' })
    };
}
function isMp3(bytes) {
    return bytes?.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
        || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}
module.exports = { isMp3, endpoint, yachiyoVoice, models, styles, validStyle, resolveStyle, validate, request };
