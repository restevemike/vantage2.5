function safe(value, fallback = '') {
  return value == null || value === '' ? fallback : String(value);
}

function number(value, digits = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : 0;
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null || value === '') return null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value ?? '').trim().toLowerCase();
  if (['yes', 'true', '1', 'on', 'y'].includes(text)) return true;
  if (['no', 'false', '0', 'off', 'n', ''].includes(text)) return false;
  return false;
}

function parseDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const uk = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  return null;
}

function normaliseTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function extractJsonObject(text) {
  const fenced = [...String(text).matchAll(/```(?:vantage-macros|vantage-nutrition|json)?\s*([\s\S]*?)```/gi)];
  for (const match of fenced) {
    const candidate = match[1].trim();
    if (!candidate.startsWith('{')) continue;
    try { return JSON.parse(candidate); } catch { /* try the next block */ }
  }
  const trimmed = String(text).trim();
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* handled below */ }
  }
  return null;
}

function normaliseMeal(raw, index, warnings) {
  const foods = String(raw?.foods ?? raw?.food ?? raw?.description ?? '').trim();
  if (!foods) {
    warnings.push(`Meal ${index + 1} had no food description and was skipped.`);
    return null;
  }
  const protein = Math.max(0, parseNumber(raw.protein ?? raw.proteinG) ?? 0);
  const carbs = Math.max(0, parseNumber(raw.carbs ?? raw.carbohydrate ?? raw.carbsG) ?? 0);
  const fat = Math.max(0, parseNumber(raw.fat ?? raw.fatG) ?? 0);
  const statedCalories = parseNumber(raw.calories ?? raw.kcal ?? raw.energy);
  const calculatedCalories = protein * 4 + carbs * 4 + fat * 9;
  const calories = Math.max(0, statedCalories ?? calculatedCalories);
  return {
    mealNumber: Math.max(1, Math.round(parseNumber(raw.mealNumber ?? raw.meal ?? raw.number) ?? index + 1)),
    time: normaliseTime(raw.time),
    foods,
    protein: number(protein, 1),
    carbs: number(carbs, 1),
    fat: number(fat, 1),
    calories: number(calories, 0),
    sodiumNote: String(raw.sodiumNote ?? raw.hydrationNote ?? raw.notes ?? '').trim(),
    preWorkout: parseBoolean(raw.preWorkout),
    postWorkout: parseBoolean(raw.postWorkout),
    preBed: parseBoolean(raw.preBed)
  };
}

function normaliseTotals(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const protein = parseNumber(raw.protein ?? raw.proteinG);
  const carbs = parseNumber(raw.carbs ?? raw.carbohydrate ?? raw.carbsG);
  const fat = parseNumber(raw.fat ?? raw.fatG);
  const calories = parseNumber(raw.calories ?? raw.kcal ?? raw.energy);
  if ([protein, carbs, fat, calories].every(value => value == null)) return null;
  const calculated = Math.max(0, protein ?? 0) * 4 + Math.max(0, carbs ?? 0) * 4 + Math.max(0, fat ?? 0) * 9;
  return {
    protein: number(Math.max(0, protein ?? 0), 1),
    carbs: number(Math.max(0, carbs ?? 0), 1),
    fat: number(Math.max(0, fat ?? 0), 1),
    calories: number(Math.max(0, calories ?? calculated), 0)
  };
}

function totalsFromMeals(meals) {
  return meals.reduce((sum, meal) => ({
    protein: sum.protein + Number(meal.protein || 0),
    carbs: sum.carbs + Number(meal.carbs || 0),
    fat: sum.fat + Number(meal.fat || 0),
    calories: sum.calories + Number(meal.calories || 0)
  }), { protein: 0, carbs: 0, fat: 0, calories: 0 });
}

export function parseNutritionMarkdown(text) {
  if (!String(text ?? '').trim()) throw new Error('The Markdown file is empty.');
  const object = extractJsonObject(text);
  if (!object) throw new Error('No vantage-macros JSON block was found.');
  const source = object.nutrition && typeof object.nutrition === 'object' ? object.nutrition : object;
  const date = parseDate(source.date);
  if (!date) throw new Error('A valid date is required in YYYY-MM-DD or DD/MM/YYYY format.');
  const warnings = [];
  const rawMeals = Array.isArray(source.meals) ? source.meals : [];
  const meals = rawMeals.map((meal, index) => normaliseMeal(meal, index, warnings)).filter(Boolean);
  const suppliedTotals = normaliseTotals(source.dailyTotals ?? source.totals ?? source.macros);
  const calculatedTotals = totalsFromMeals(meals);
  const dailyTotals = suppliedTotals || (meals.length ? calculatedTotals : null);

  if (!meals.length && !dailyTotals) throw new Error('No meals or daily macro totals were found.');
  if (suppliedTotals && meals.length) {
    const delta = Math.abs(suppliedTotals.calories - calculatedTotals.calories);
    if (delta > 100) warnings.push(`Supplied calories differ from the sum of meal calories by ${Math.round(delta)} kcal.`);
  }

  const rawTargets = source.targets ?? source.targetRange ?? source.nutritionTargets ?? null;
  const targets = rawTargets && typeof rawTargets === 'object' ? {
    protein: rawTargets.protein ?? rawTargets.proteinG ?? null,
    carbs: rawTargets.carbs ?? rawTargets.carbsG ?? rawTargets.carbohydrate ?? null,
    fat: rawTargets.fat ?? rawTargets.fatG ?? null,
    calories: rawTargets.calories ?? rawTargets.kcal ?? rawTargets.energy ?? null
  } : null;
  const coachingNotes = Array.isArray(source.coachingNotes) ? source.coachingNotes.map(String)
    : Array.isArray(source.coaching?.notes) ? source.coaching.notes.map(String)
    : source.coachingNotes ? [String(source.coachingNotes)] : [];
  return {
    date, meals, dailyTotals, targets, coachingNotes,
    notes: String(source.notes ?? source.coaching?.summary ?? '').trim(),
    warnings, macroSource: 'alex-generated-markdown', sourceConfidence: 'user-confirmed',
    sourceFormat: 'structured vantage-macros JSON block'
  };
}

export function createNutritionMarkdown({ date, meals = [], dailyTotals = null, notes = '', generatedAt = new Date().toISOString() }) {
  const totals = dailyTotals || totalsFromMeals(meals);
  const payload = {
    schema: 'vantage-macros-v1',
    date,
    generatedAt,
    weightConvention: 'Meat, fish, chicken, beef, rice, potato and sweet potato weights are cooked unless explicitly stated otherwise.',
    meals: meals.map((meal, index) => ({
      mealNumber: meal.mealNumber ?? index + 1,
      time: meal.time || '',
      foods: meal.foods || '',
      protein: number(meal.protein, 1),
      carbs: number(meal.carbs, 1),
      fat: number(meal.fat, 1),
      calories: number(meal.calories, 0),
      sodiumNote: meal.sodiumNote || '',
      preWorkout: Boolean(meal.preWorkout),
      postWorkout: Boolean(meal.postWorkout),
      preBed: Boolean(meal.preBed)
    })),
    dailyTotals: {
      protein: number(totals.protein, 1),
      carbs: number(totals.carbs, 1),
      fat: number(totals.fat, 1),
      calories: number(totals.calories, 0)
    },
    targets: null,
    coachingNotes: [],
    notes: safe(notes)
  };

  const lines = [
    '# VANTAGE Daily Macro Report',
    '',
    '> Upload this file to the VANTAGE macro thread for review, correction or completion.',
    '',
    `- **Date:** ${safe(date)}`,
    `- **Meals logged:** ${meals.length}`,
    `- **Protein:** ${number(totals.protein, 1)} g`,
    `- **Carbohydrate:** ${number(totals.carbs, 1)} g`,
    `- **Fat:** ${number(totals.fat, 1)} g`,
    `- **Calories:** ${number(totals.calories, 0)} kcal`,
    '',
    '```vantage-macros',
    JSON.stringify(payload, null, 2),
    '```',
    '',
    'Review these meals and totals against Steve’s current phase. Correct any nutrition estimates that are materially wrong, then return an updated downloadable VANTAGE macro Markdown file using the same schema.',
    ''
  ];
  return lines.join('\n');
}

export function nutritionMarkdownFilename(date) {
  return `VANTAGE_Macros_${safe(date, 'Undated')}.md`;
}

export const MACRO_FILE_PROMPT = `You are the VANTAGE daily macro file generator for Steve.

Use the meals, food weights, screenshots, labels and macro information Steve has already provided in this conversation. When Steve asks for a VANTAGE macro file, read the latest complete day in this thread and create an actual downloadable Markdown file. Do not ask him to repeat information already available. Do not combine different dates. Do not invent missing foods or quantities.

Standing rule: weights for meat, fish, chicken, beef, rice, potato and sweet potato are cooked unless Steve explicitly says otherwise.

File name: VANTAGE_Macros_YYYY-MM-DD.md

The file must contain exactly one fenced code block labelled vantage-macros with valid JSON in this format:

\`\`\`vantage-macros
{
  "schema": "vantage-macros-v1",
  "date": "YYYY-MM-DD",
  "meals": [
    {
      "mealNumber": 1,
      "time": "08:15",
      "foods": "Food description and cooked weights",
      "protein": 0,
      "carbs": 0,
      "fat": 0,
      "calories": 0,
      "sodiumNote": "",
      "preWorkout": false,
      "postWorkout": false,
      "preBed": false
    }
  ],
  "dailyTotals": {
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "calories": 0
  },
  "targets": {
    "protein": {"min": 0, "max": 0},
    "carbs": {"min": 0, "max": 0},
    "fat": {"min": 0, "max": 0},
    "calories": {"min": 0, "max": 0}
  },
  "coachingNotes": [],
  "notes": ""
}
\`\`\`

Rules:
- Use only information Steve supplied in this thread.
- Estimate macros from the stated food and cooked weight where required.
- Use 4 kcal per gram of protein, 4 kcal per gram of carbohydrate and 9 kcal per gram of fat as a reasonableness check.
- Keep packaged-food values when Steve provides a label or exact product data.
- Omit uncertain meal times rather than inventing them.
- If only daily totals are available, return an empty meals array and populate dailyTotals.
- Include Steve’s current target ranges in targets when they are known.
- Preserve practical coaching notes, sodium/hydration cautions and meal-sequence corrections in coachingNotes.
- Flag genuine ambiguity before generating the file.
- Return an actual downloadable .md file, not only Markdown displayed in chat.

When Steve says “Create today’s VANTAGE macro file”, use the latest meals already provided in this thread.`;
