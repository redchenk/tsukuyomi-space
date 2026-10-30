const { randomInt } = require('node:crypto');
const db = require('../db');
const prompts = require('../../shared/drift-prompts.json');

// Keep an active draw stable across restarts and text edits. Retired prompts are
// replaced so an already-selected question cannot outlive its removal from the pool.
const dailyPrompt = db.transaction(date => {
    const existing = db.prepare('SELECT prompt_id,prompt_json FROM drift_daily_prompts WHERE date=?').get(date);
    if (existing && prompts.some(prompt => prompt.id === existing.prompt_id)) return { date, id: existing.prompt_id, text: JSON.parse(existing.prompt_json) };
    const previous = db.prepare('SELECT prompt_id FROM drift_daily_prompts WHERE date < ? ORDER BY date DESC LIMIT 1').get(date);
    const candidates = prompts.filter(prompt => prompt.id !== previous?.prompt_id);
    const prompt = candidates[randomInt(candidates.length)];
    db.prepare(`INSERT INTO drift_daily_prompts(date,prompt_id,prompt_json) VALUES(?,?,?)
        ON CONFLICT(date) DO UPDATE SET prompt_id=excluded.prompt_id,prompt_json=excluded.prompt_json`).run(date,prompt.id,JSON.stringify(prompt.text));
    return { date, ...prompt };
});

function getDailyPrompt(date) {
    return dailyPrompt.immediate(date);
}

function bottleWithPrompt(row) {
    const { daily_prompt_date, daily_prompt_id, daily_prompt_json, ...bottle } = row;
    // Reading a bottle carries only its quest origin; the writing prompt stays
    // out of letters, lists and moderation responses.
    return { ...bottle, dailyPrompt: daily_prompt_id ? { date: daily_prompt_date, id: daily_prompt_id } : null };
}

module.exports = { getDailyPrompt, bottleWithPrompt };
