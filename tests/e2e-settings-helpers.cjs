const { expect } = require('@playwright/test');
async function settingsCategory(page, label) {
  const names = { '角色知识库': '角色与对话', '角色与布局': '外观与布局', '语音与朗读 可选': '语音与朗读', '聊天模型 必需': '聊天模型' };
  await page.locator('.settings-detail-toolbar').getByRole('button').click();
  await page.locator('.settings-category-grid').getByRole('button', { name: names[label] || label, exact: true }).click();
}
async function saveSettingsAndReturn(page) {
  await page.locator('.settings-savebar').getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.locator('.settings-save-state')).toContainText('已保存');
  await page.locator('.settings-page-heading').getByRole('link', { name: '返回房间', exact: true }).click();
}
module.exports = { settingsCategory, saveSettingsAndReturn };
