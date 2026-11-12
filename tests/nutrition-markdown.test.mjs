import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNutritionMarkdown, createNutritionMarkdown, nutritionMarkdownFilename } from '../nutrition-markdown.js';

test('parses meals and calculates missing calories', () => {
  const result = parseNutritionMarkdown(`# Daily macros\n\n\`\`\`vantage-macros\n{
    "schema":"vantage-macros-v1",
    "date":"2026-07-14",
    "meals":[{
      "mealNumber":1,
      "time":"08:15",
      "foods":"40 g cream of rice and whey",
      "protein":30,
      "carbs":38,
      "fat":2,
      "preWorkout":true
    }]
  }\n\`\`\``);
  assert.equal(result.date, '2026-07-14');
  assert.equal(result.meals.length, 1);
  assert.equal(result.meals[0].calories, 290);
  assert.equal(result.dailyTotals.protein, 30);
  assert.equal(result.dailyTotals.calories, 290);
});

test('accepts totals-only files', () => {
  const result = parseNutritionMarkdown(`\`\`\`vantage-macros\n{
    "date":"14/07/2026",
    "meals":[],
    "dailyTotals":{"protein":190,"carbs":230,"fat":55,"calories":2175}
  }\n\`\`\``);
  assert.equal(result.date, '2026-07-14');
  assert.equal(result.meals.length, 0);
  assert.equal(result.dailyTotals.calories, 2175);
});

test('creates a round-trippable report', () => {
  const markdown = createNutritionMarkdown({
    date: '2026-07-14',
    meals: [{ mealNumber: 1, time: '08:00', foods: 'Eggs and sourdough', protein: 35, carbs: 40, fat: 20, calories: 480 }]
  });
  const parsed = parseNutritionMarkdown(markdown);
  assert.equal(parsed.meals[0].foods, 'Eggs and sourdough');
  assert.match(markdown, /VANTAGE Daily Macro Report/);
  assert.equal(nutritionMarkdownFilename('2026-07-14'), 'VANTAGE_Macros_2026-07-14.md');
});

test('rejects files without nutrition data', () => {
  assert.throws(() => parseNutritionMarkdown('# Nothing useful'), /No vantage-macros JSON block/);
});
