import { parseNutritionMarkdown } from './nutrition-markdown.js';
import { parseVitalsMarkdown } from './vitals-markdown.js';
import { parseBloodworkMarkdown } from './bloodwork-markdown.js';

function fencedPayload(text, label) {
  const pattern = new RegExp('```' + label + '\\s*([\\s\\S]*?)```', 'i');
  const match = String(text || '').match(pattern);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch (error) { throw new Error(`${label} block contains invalid JSON: ${error.message}`); }
}

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }

function detectSchema(text) {
  const match = String(text || '').match(/"schema"\s*:\s*"([^"]+)"/i);
  return match?.[1] || '';
}

function recoveryResult(text) {
  const payload = fencedPayload(text, 'vantage-recovery-session');
  if (!payload || payload.schema !== 'vantage-recovery-session-v1') return null;
  if (!validDate(payload.date)) throw new Error('Recovery date must use YYYY-MM-DD.');
  if (!payload.activity && !payload.sessionType) throw new Error('Recovery file has no activity/session type.');
  return {
    type: 'recovery', schema: payload.schema, date: payload.date,
    label: 'Recovery session', payload,
    summary: `${payload.activity || payload.sessionType}${payload.durationMinutes != null ? ` · ${payload.durationMinutes} min` : ''}`,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : []
  };
}

export function detectHistoricalMarkdown(text, fileName = '') {
  if (!String(text || '').trim()) throw new Error('The Markdown file is empty.');
  const schema = detectSchema(text);

  if (schema === 'vantage-macros-v1' || /```vantage-macros/i.test(text)) {
    const payload = parseNutritionMarkdown(text);
    return {
      type: 'macros', schema: 'vantage-macros-v1', date: payload.date,
      label: 'Daily macros / meals', payload,
      summary: `${payload.meals.length} meals${payload.dailyTotals ? ` · ${Math.round(Number(payload.dailyTotals.calories || 0))} kcal` : ''}`,
      warnings: payload.warnings || []
    };
  }

  if (schema === 'vantage-vitals-v1' || /```vantage-vitals/i.test(text)) {
    const payload = parseVitalsMarkdown(text);
    const date = payload.values?.date;
    if (!validDate(date)) throw new Error('Vitals file does not contain a valid historical date.');
    return {
      type: 'vitals', schema: 'vantage-vitals-v1', date,
      label: 'Vitals / readiness', payload,
      summary: [payload.values?.recovery != null ? `Recovery ${payload.values.recovery}%` : null, payload.values?.hrv != null ? `HRV ${payload.values.hrv}` : null, payload.values?.weight != null ? `${payload.values.weight} kg` : null].filter(Boolean).join(' · ') || `${payload.importedFields?.length || 0} fields`,
      warnings: payload.warnings || []
    };
  }

  if (schema === 'vantage-bloodwork-v1' || /```vantage-bloodwork\b/i.test(text)) {
    const payload = parseBloodworkMarkdown(text, fileName);
    return {
      type: 'bloodwork', schema: payload.schema, date: payload.date,
      label: 'Bloodwork panel', payload,
      summary: `${payload.markers.length} markers${payload.labName ? ` · ${payload.labName}` : ''}`,
      warnings: []
    };
  }

  const recovery = recoveryResult(text);
  if (recovery) return recovery;

  throw new Error('Unsupported VANTAGE Markdown type. Historical import currently supports Vitals, Macros, Recovery session and Bloodwork files.');
}
