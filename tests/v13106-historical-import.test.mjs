import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectHistoricalMarkdown } from '../historical-import.js';

test('v1.3.10.6 detects historical macro file date rather than substituting today', () => {
  const md = `\n\`\`\`vantage-macros\n${JSON.stringify({schema:'vantage-macros-v1',date:'2026-09-11',meals:[{mealNumber:1,time:'08:00',foods:'Eggs',protein:24,carbs:2,fat:20,calories:290}],dailyTotals:{protein:24,carbs:2,fat:20,calories:290}})}\n\`\`\``;
  const result = detectHistoricalMarkdown(md,'VANTAGE_Macros_2026-09-11.md');
  assert.equal(result.type,'macros');
  assert.equal(result.date,'2026-09-11');
  assert.equal(result.payload.dailyTotals.calories,290);
});

test('v1.3.10.6 detects historical vitals with source date', () => {
  const md = `\n\`\`\`vantage-vitals\n${JSON.stringify({schema:'vantage-vitals-v1',date:'2026-09-10',recovery:88,hrv:71,restingHr:44,synthesis:'Peak'})}\n\`\`\``;
  const result = detectHistoricalMarkdown(md,'VANTAGE_Vitals_2026-09-10.md');
  assert.equal(result.type,'vitals');
  assert.equal(result.date,'2026-09-10');
  assert.equal(result.payload.values.recovery,88);
  assert.equal(result.payload.values.synthesis,'Peak');
});

test('v1.3.10.6 detects historical recovery session', () => {
  const md = `\n\`\`\`vantage-recovery-session\n${JSON.stringify({schema:'vantage-recovery-session-v1',date:'2026-09-09',activity:'Inversion',durationMinutes:10})}\n\`\`\``;
  const result = detectHistoricalMarkdown(md,'VANTAGE_Recovery_2026-09-09_Inversion.md');
  assert.equal(result.type,'recovery');
  assert.equal(result.date,'2026-09-09');
});

test('v1.3.10.6 Data screen exposes Historical Markdown import and app applies file date', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url),'utf8');
  assert.match(html,/Historical Markdown import/);
  assert.match(html,/historicalMarkdownInput/);
  assert.match(app,/detectHistoricalMarkdown/);
  assert.match(app,/File date will be used exactly; today will not be substituted/);
  assert.match(app,/historical-markdown-late-import/);
  assert.match(sw,/historical-import\.js/);
  assert.match(sw,/vantage-training-console-v15-1/);
});
