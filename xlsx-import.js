const textDecoder = new TextDecoder('utf-8');

const clean = value => value == null ? '' : String(value).trim();
const nameKey = value => clean(value).toLocaleLowerCase('en-GB').replace(/\s+/g, ' ');
const slug = value => nameKey(value).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableId(prefix, value) {
  return `${prefix}-${slug(value)}-${hashString(value)}`;
}

function readU16(view, offset) { return view.getUint16(offset, true); }
function readU32(view, offset) { return view.getUint32(offset, true); }

async function inflateRaw(bytes) {
  if (!('DecompressionStream' in globalThis)) throw new Error('This browser cannot decompress Excel files. Update Chrome and retry.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const minimum = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minimum; i -= 1) {
    if (readU32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid XLSX file: ZIP directory not found.');

  const entryCount = readU16(view, eocd + 10);
  let offset = readU32(view, eocd + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(view, offset) !== 0x02014b50) throw new Error('Invalid XLSX file: corrupt ZIP directory.');
    const method = readU16(view, offset + 10);
    const compressedSize = readU32(view, offset + 20);
    const fileNameLength = readU16(view, offset + 28);
    const extraLength = readU16(view, offset + 30);
    const commentLength = readU16(view, offset + 32);
    const localHeaderOffset = readU32(view, offset + 42);
    const fileName = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (readU32(view, localHeaderOffset) !== 0x04034b50) throw new Error(`Invalid XLSX file: missing entry ${fileName}.`);
    const localNameLength = readU16(view, localHeaderOffset + 26);
    const localExtraLength = readU16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = await inflateRaw(compressed);
    else throw new Error(`Unsupported XLSX compression method ${method}.`);
    entries.set(fileName.replace(/^\//, ''), data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlDocument(text, label) {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  const error = document.querySelector('parsererror');
  if (error) throw new Error(`Could not read ${label}: ${error.textContent.slice(0, 120)}`);
  return document;
}

function decodeEntry(entries, path, required = true) {
  const bytes = entries.get(path);
  if (!bytes) {
    if (required) throw new Error(`Workbook part not found: ${path}`);
    return '';
  }
  return textDecoder.decode(bytes);
}

function normalisePath(base, target) {
  const parts = `${base}/${target}`.split('/');
  const output = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') output.pop();
    else output.push(part);
  }
  return output.join('/');
}

function cellColumn(reference) {
  const letters = String(reference || '').match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  let column = 0;
  for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
  return column - 1;
}

function sharedStrings(entries) {
  const xml = decodeEntry(entries, 'xl/sharedStrings.xml', false);
  if (!xml) return [];
  const document = xmlDocument(xml, 'shared strings');
  return [...document.getElementsByTagNameNS('*', 'si')].map(item =>
    [...item.getElementsByTagNameNS('*', 't')].map(node => node.textContent || '').join('')
  );
}

function workbookSheets(entries) {
  const workbook = xmlDocument(decodeEntry(entries, 'xl/workbook.xml'), 'workbook');
  const relationships = xmlDocument(decodeEntry(entries, 'xl/_rels/workbook.xml.rels'), 'workbook relationships');
  const relationMap = new Map([...relationships.getElementsByTagNameNS('*', 'Relationship')].map(node => [node.getAttribute('Id'), node.getAttribute('Target')]));
  return [...workbook.getElementsByTagNameNS('*', 'sheet')].map(node => {
    const id = node.getAttribute('r:id') || node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    return { name: node.getAttribute('name'), path: normalisePath('xl', relationMap.get(id)) };
  });
}

function sheetRows(entries, path, strings) {
  const document = xmlDocument(decodeEntry(entries, path), path);
  const rows = [];
  for (const rowNode of document.getElementsByTagNameNS('*', 'row')) {
    const row = [];
    for (const cell of rowNode.getElementsByTagNameNS('*', 'c')) {
      const column = cellColumn(cell.getAttribute('r'));
      const type = cell.getAttribute('t');
      const valueNode = cell.getElementsByTagNameNS('*', 'v')[0];
      const inline = cell.getElementsByTagNameNS('*', 'is')[0];
      let value = null;
      if (type === 's' && valueNode) value = strings[Number(valueNode.textContent)] ?? '';
      else if (type === 'inlineStr' && inline) value = [...inline.getElementsByTagNameNS('*', 't')].map(node => node.textContent || '').join('');
      else if (type === 'b' && valueNode) value = valueNode.textContent === '1';
      else if ((type === 'str' || type === 'e') && valueNode) value = valueNode.textContent;
      else if (valueNode) {
        const numeric = Number(valueNode.textContent);
        value = Number.isFinite(numeric) ? numeric : valueNode.textContent;
      }
      row[column] = value;
    }
    rows[Number(rowNode.getAttribute('r') || rows.length + 1) - 1] = row;
  }
  return rows;
}

function rowsToObjects(rows, headerRow = 0) {
  const headers = (rows[headerRow] || []).map(clean);
  return rows.slice(headerRow + 1).filter(row => row?.some(value => value != null && value !== '')).map(row => {
    const output = {};
    headers.forEach((header, index) => { if (header) output[header] = row?.[index] ?? null; });
    return output;
  });
}

function excelDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const milliseconds = Math.round((number - 25569) * 86400000);
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function timeText(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value)) return value.slice(0, 5).padStart(5, '0');
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const totalMinutes = Math.round((number % 1) * 1440) % 1440;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function dateTime(date, time) {
  const datePart = excelDate(date);
  const timePart = timeText(time);
  return datePart && timePart ? `${datePart}T${timePart}:00` : datePart ? `${datePart}T12:00:00` : null;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedNumber(value, minimum, maximum) {
  const number = numberOrNull(value);
  return number != null && number >= minimum && number <= maximum ? number : null;
}

function yes(value) { return /^(yes|true|1)$/i.test(clean(value)); }

function normaliseSetType(value) {
  const key = nameKey(value);
  if (key.includes('warm')) return 'Warm-up';
  if (key.includes('back')) return 'Back-off';
  if (key.includes('drop')) return 'Drop';
  return 'Work';
}

function inferMode(sessionType) {
  const key = nameKey(sessionType);
  if (key.includes('deload')) return 'deload';
  if (key.includes('bp')) return 'bp-watch';
  if (key.includes('controlled') || key.includes('recovery') || key.includes('watch')) return 'recovery-watch';
  return 'normal';
}

function baseSessionType(sessionType) {
  const key = nameKey(sessionType);
  if (key.includes('chest') && key.includes('biceps')) return 'Chest & Biceps';
  if (key.includes('shoulder') && key.includes('tricep')) return 'Shoulders & Triceps';
  if (key.includes('back')) return 'Back';
  if (key.includes('leg')) return 'Legs';
  if (key.includes('arm')) return 'Arms - Biceps & Triceps';
  if (key.includes('liss') || key.includes('walk') || key.includes('cardio')) return 'LISS / Cardio';
  if (key.includes('yoga') || key.includes('recovery')) return 'Yoga / Recovery';
  return clean(sessionType) || 'Training';
}

function inferBodyGroup(name, workoutType) {
  const key = nameKey(name);
  if (key.includes('tibialis')) return 'Tibialis';
  if (key.includes('calf')) return 'Calves';
  if (key.includes('leg curl')) return 'Hamstrings';
  if (key.includes('leg extension') || key.includes('squat') || key.includes('leg press')) return 'Quads';
  if (key.includes('tricep') || key.includes('pushdown') || key.includes('push down') || key.includes('skull')) return 'Triceps';
  if (key.includes('curl')) return 'Biceps';
  if (key.includes('rear delt')) return 'Rear Delts';
  if (key.includes('lateral') || key.includes('shoulder') || key.includes('front raise')) return 'Shoulders';
  if (key.includes('chest') || key.includes('fly') || key.includes('bench') || (key.includes('press') && nameKey(workoutType).includes('chest'))) return 'Chest';
  if (key.includes('deadlift') || key.includes('back extension') || key.includes('hyperextension')) return 'Posterior Chain';
  if (key.includes('row') || key.includes('pull') || key.includes('lat')) return 'Back';
  return baseSessionType(workoutType);
}

function inferEquipment(name) {
  const key = nameKey(name);
  if (key.includes('cable')) return 'Cable';
  if (key.includes('dumbbell')) return 'Dumbbell';
  if (key.includes('barbell') || key.includes('deadlift')) return 'Barbell';
  if (key.includes('hammer strength') || key.includes('machine') || key.includes('cybex') || key.includes('rogers')) return 'Machine';
  if (key.includes('bodyweight') || key.includes('hyperextension')) return 'Bodyweight / Loaded';
  if (key.includes('plate') || key.includes('landmine') || key.includes('t bar')) return 'Plate-loaded';
  return 'Other';
}

function exerciseFromLibraryRow(row) {
  // The source workbook labels B as "Body Group" and C as "Exercise", but the row data is the other way around.
  const exerciseName = clean(row['Body Group'] || row.Exercise);
  const bodyGroup = clean(row.Exercise || row['Body Group']);
  const workoutType = clean(row['Workout Type']);
  if (!exerciseName) return null;
  return {
    id: stableId('exercise', exerciseName),
    name: exerciseName,
    nameKey: nameKey(exerciseName),
    workoutType,
    bodyGroup,
    equipment: clean(row.Equipment) || inferEquipment(exerciseName),
    notes: clean(row.Notes),
    aliases: [],
    firstSeen: excelDate(row['First Seen']),
    lastUsed: excelDate(row['Last Used']),
    usageCount: numberOrNull(row['Usage Count']) || 0,
    source: 'workbook-library'
  };
}

function createExercise(name, workoutType, source = 'workbook-history') {
  return {
    id: stableId('exercise', name), name: clean(name), nameKey: nameKey(name),
    workoutType: baseSessionType(workoutType), bodyGroup: inferBodyGroup(name, workoutType),
    equipment: inferEquipment(name), notes: '', aliases: [], firstSeen: null, lastUsed: null,
    usageCount: 0, source
  };
}

function enrichExerciseUsage(exercises, setRows) {
  const byKey = new Map(exercises.map(item => [item.nameKey, item]));
  const usage = new Map();
  for (const row of setRows) {
    const key = nameKey(row.Exercise);
    if (!key) continue;
    const date = excelDate(row.Date);
    const current = usage.get(key) || { count: 0, first: null, last: null, workoutType: row.SessionType };
    current.count += 1;
    if (date && (!current.first || date < current.first)) current.first = date;
    if (date && (!current.last || date > current.last)) current.last = date;
    usage.set(key, current);
    if (!byKey.has(key)) {
      const created = createExercise(row.Exercise, row.SessionType);
      exercises.push(created); byKey.set(key, created);
    }
  }
  for (const [key, stats] of usage) {
    const exercise = byKey.get(key);
    exercise.usageCount = stats.count;
    exercise.firstSeen = stats.first || exercise.firstSeen;
    exercise.lastUsed = stats.last || exercise.lastUsed;
    if (!exercise.workoutType) exercise.workoutType = baseSessionType(stats.workoutType);
  }
  return exercises;
}

function buildTemplates(templateRows, exerciseMap) {
  const groups = new Map();
  for (const row of templateRows) {
    const sessionType = clean(row.SessionType);
    const exerciseName = clean(row.Exercise);
    if (!sessionType || !exerciseName) continue;
    if (!groups.has(sessionType)) groups.set(sessionType, new Map());
    const exercises = groups.get(sessionType);
    const key = nameKey(exerciseName);
    if (!exercises.has(key)) exercises.set(key, { name: exerciseName, order: Number(row.Order) || 9999, sets: [] });
    const exercise = exercises.get(key);
    exercise.order = Math.min(exercise.order, Number(row.Order) || exercise.order);
    const rawWeight = row.DefaultWeightKg;
    const weight = typeof rawWeight === 'string' && nameKey(rawWeight).includes('body') ? 0 : numberOrNull(rawWeight) ?? 0;
    const setType = normaliseSetType(row.SetType);
    exercise.sets.push({
      setType,
      weightKg: weight,
      reps: numberOrNull(row.TargetReps) ?? (setType === 'Warm-up' ? 12 : 8),
      rpe: boundedNumber(row.RPE, 1, 10) ?? (setType === 'Warm-up' ? 4 : 8),
      failure: yes(row['Failure?']) || nameKey(row.SetType).includes('failure'),
      holdSeconds: numberOrNull(row.HoldSec) || 0,
      notes: clean(row.Notes)
    });
  }
  return [...groups.entries()].map(([sessionType, exerciseGroups]) => ({
    id: `template-${slug(sessionType)}`,
    name: sessionType,
    category: 'strength',
    source: 'workbook',
    exercises: [...exerciseGroups.values()].sort((a, b) => a.order - b.order).map(item => {
      const sourceExercise = exerciseMap.get(nameKey(item.name));
      return {
        id: sourceExercise?.id || stableId('exercise', item.name),
        sourceExerciseId: sourceExercise?.id || stableId('exercise', item.name),
        name: item.name,
        notes: '',
        sets: item.sets
      };
    })
  }));
}

function buildSessions(sessionRows, setRows, exerciseMap) {
  const setsBySession = new Map();
  for (const row of setRows) {
    const sessionId = clean(row.SessionID);
    if (!sessionId) continue;
    if (!setsBySession.has(sessionId)) setsBySession.set(sessionId, []);
    setsBySession.get(sessionId).push(row);
  }
  const sessionMap = new Map(sessionRows.filter(row => clean(row.SessionID)).map(row => [clean(row.SessionID), row]));
  const ids = new Set([...sessionMap.keys(), ...setsBySession.keys()]);
  const output = [];

  for (const sourceSessionId of ids) {
    const metadata = sessionMap.get(sourceSessionId) || {};
    const rows = (setsBySession.get(sourceSessionId) || []).sort((a, b) => (Number(a.Line) || 0) - (Number(b.Line) || 0));
    const sessionType = clean(metadata.SessionType || rows[0]?.SessionType || 'Training');
    const dateValue = metadata.Date ?? rows[0]?.Date;
    const date = excelDate(dateValue);
    if (!date) continue;
    const exerciseGroups = new Map();
    for (const row of rows) {
      const exerciseName = clean(row.Exercise);
      if (!exerciseName) continue;
      const key = nameKey(exerciseName);
      if (!exerciseGroups.has(key)) exerciseGroups.set(key, { name: exerciseName, firstLine: Number(row.Line) || 9999, sets: [] });
      const group = exerciseGroups.get(key);
      group.firstLine = Math.min(group.firstLine, Number(row.Line) || group.firstLine);
      group.sets.push({
        id: stableId('set', `${sourceSessionId}|${row.Line}|${exerciseName}|${row.SetNo}`),
        setType: normaliseSetType(row.SetType), setNumber: numberOrNull(row.SetNo) || group.sets.length + 1,
        weightKg: numberOrNull(row.WeightKg) || 0, reps: numberOrNull(row.Reps) || 0,
        rpe: boundedNumber(row.RPE, 1, 10), failure: yes(row['Failure?']), holdSeconds: numberOrNull(row.HoldSec) || 0,
        notes: clean(row.Notes), sourceSetType: clean(row.SetType), sourceLine: numberOrNull(row.Line)
      });
    }
    const exercises = [...exerciseGroups.values()].sort((a, b) => a.firstLine - b.firstLine).map((group, index) => {
      const sourceExercise = exerciseMap.get(nameKey(group.name));
      return {
        id: stableId('session-exercise', `${sourceSessionId}|${group.name}`),
        sourceExerciseId: sourceExercise?.id || stableId('exercise', group.name),
        name: group.name, lineNumber: index + 1, notes: '', sets: group.sets
      };
    });
    output.push({
      id: `sheet-${sourceSessionId}`,
      sourceSessionId,
      source: 'workbook',
      date,
      startedAt: dateTime(dateValue, metadata.StartTime),
      completedAt: metadata.StopTime != null ? dateTime(dateValue, metadata.StopTime) : dateTime(dateValue, metadata.StartTime),
      durationMinutes: numberOrNull(metadata.Duration),
      templateId: `template-${slug(baseSessionType(sessionType))}`,
      sessionType,
      category: 'strength',
      mode: inferMode(sessionType),
      bodyweightKg: numberOrNull(metadata.BodyweightKg),
      notes: clean(metadata.Notes),
      importedTotals: {
        totalSets: numberOrNull(metadata.TotalSets), failureSets: numberOrNull(metadata.FailureSets), totalVolumeKg: numberOrNull(metadata.TotalVolumeKg)
      },
      exercises
    });
  }
  return output.sort((a, b) => b.date.localeCompare(a.date));
}

function buildNutritionDays(rows) {
  return rows.map(row => {
    const date = excelDate(row.Date);
    if (!date) return null;
    return {
      id: `nutrition-${date}`, date, source: 'workbook', day: clean(row.Day), bodyweightKg: numberOrNull(row['Bodyweight kg']),
      waistCm: numberOrNull(row['Waist cm']), dayType: clean(row['Day Type']), sourceSessionId: clean(row.SessionID),
      sessionType: clean(row['Session Type']), durationMinutes: numberOrNull(row['Duration Min']), totalSets: numberOrNull(row['Total Sets']),
      failureSets: numberOrNull(row['Failure Sets']), trainingVolumeKg: numberOrNull(row['Training Volume kg']), lissMinutes: row['LISS Min'] ?? null,
      steps: numberOrNull(row.Steps), protein: numberOrNull(row['Protein g']), carbs: numberOrNull(row['Carbs g']), fat: numberOrNull(row['Fat g']),
      calories: numberOrNull(row['Macro kcal']), targetProtein: clean(row['Target Protein']), targetCarbs: clean(row['Target Carbs']),
      targetFat: clean(row['Target Fat']), targetCalories: clean(row['Target Kcal']), notes: clean(row.Notes)
    };
  }).filter(Boolean);
}

export async function parseVantageWorkbook(file) {
  const entries = await unzip(await file.arrayBuffer());
  const strings = sharedStrings(entries);
  const sheets = workbookSheets(entries);
  const wanted = new Set(['Session_Log', 'Set_Log', 'Exercise_Library', 'Workout_Templates', 'Macro_Log']);
  const rowsByName = {};
  for (const sheet of sheets) {
    if (wanted.has(sheet.name)) rowsByName[sheet.name] = sheetRows(entries, sheet.path, strings);
  }

  for (const required of ['Session_Log', 'Set_Log', 'Exercise_Library', 'Workout_Templates']) {
    if (!rowsByName[required]) throw new Error(`Required sheet not found: ${required}`);
  }

  const sessionRows = rowsToObjects(rowsByName.Session_Log, 0);
  const setRows = rowsToObjects(rowsByName.Set_Log, 0);
  const templateRows = rowsToObjects(rowsByName.Workout_Templates, 0);
  const libraryRows = rowsToObjects(rowsByName.Exercise_Library, 0);
  const nutritionRows = rowsByName.Macro_Log ? rowsToObjects(rowsByName.Macro_Log, 3) : [];

  const exercises = libraryRows.map(exerciseFromLibraryRow).filter(Boolean);
  enrichExerciseUsage(exercises, setRows);
  exercises.sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  const exerciseMap = new Map(exercises.map(item => [item.nameKey, item]));
  const templates = buildTemplates(templateRows, exerciseMap);
  const sessions = buildSessions(sessionRows, setRows, exerciseMap);
  const nutritionDays = buildNutritionDays(nutritionRows);
  const libraryNames = new Set(libraryRows.map(row => nameKey(row['Body Group'] || row.Exercise)).filter(Boolean));
  const historicNames = new Set(setRows.map(row => nameKey(row.Exercise)).filter(Boolean));
  const historyOnlyCount = [...historicNames].filter(name => !libraryNames.has(name)).length;
  const invalidRpeCount = setRows.filter(row => numberOrNull(row.RPE) != null && boundedNumber(row.RPE, 1, 10) == null).length;

  return {
    importedAt: new Date().toISOString(), fileName: file.name,
    sessions, templates, exercises, nutritionDays,
    summary: {
      sheetsFound: Object.keys(rowsByName), sessions: sessions.length,
      setRows: setRows.length, exercises: exercises.length, libraryExercises: libraryNames.size,
      historyOnlyExercises: historyOnlyCount, invalidRpeValuesIgnored: invalidRpeCount, templates: templates.length,
      templateRows: templateRows.length, nutritionDays: nutritionDays.length
    },
    warnings: [
      historyOnlyCount ? `${historyOnlyCount} exercise names appear in Set_Log but not in Exercise_Library. They will be added as history-derived exercises.` : null,
      invalidRpeCount ? `${invalidRpeCount} invalid RPE values were ignored because they were Excel date serials rather than values from 1 to 10.` : null,
      'Today_Workout is deliberately not imported as history because it contains live controls, formulas and temporary rows.',
      'Macro_Log is imported as daily nutrition summaries; it is not detailed enough to recreate individual meals.'
    ].filter(Boolean)
  };
}

export { excelDate, normaliseSetType, inferMode, baseSessionType, nameKey, stableId };
