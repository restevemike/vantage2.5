const isoDate = offsetDays => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const exercise = (name, sets = [
  { setType: 'Warm-up', weightKg: 0, reps: 12, rpe: 4, failure: false },
  { setType: 'Work', weightKg: 0, reps: 8, rpe: 8, failure: false }
]) => ({ id: crypto.randomUUID(), name, notes: '', sets });

export const templates = [
  {
    id: 'legs', name: 'Legs', category: 'strength',
    exercises: [
      exercise('Leg extension'), exercise('Hack squat'), exercise('Leg press'),
      exercise('Lying leg curl'), exercise('Seated leg curl'), exercise('Standing calf raise'),
      exercise('Seated calf raise'), exercise('Tibialis raise machine')
    ]
  },
  {
    id: 'chest-biceps', name: 'Chest & Biceps', category: 'strength',
    exercises: [
      exercise('Machine chest press'), exercise('Incline press'), exercise('Cable fly / pec deck'),
      exercise('Preacher curl'), exercise('Incline dumbbell curl'), exercise('Hammer curl')
    ]
  },
  {
    id: 'back', name: 'Back', category: 'strength',
    exercises: [
      exercise('Pulldown'), exercise('Hammer Strength iso-lateral row'), exercise('Seated cable row'),
      exercise('Cable pullover'), exercise('Rear-delt row')
    ]
  },
  {
    id: 'shoulders-triceps', name: 'Shoulders & Triceps', category: 'strength',
    exercises: [
      exercise('Machine shoulder press'), exercise('Lateral raise'), exercise('Rear-delt fly'),
      exercise('Triceps pressdown'), exercise('Overhead triceps extension'), exercise('Machine dip')
    ]
  },
  {
    id: 'liss', name: 'LISS / Cardio', category: 'cardio',
    exercises: [exercise('Cardio session', [{ setType: 'Work', weightKg: 0, reps: 0, rpe: 4, failure: false }])]
  },
  {
    id: 'recovery', name: 'Yoga / Recovery', category: 'recovery',
    exercises: [exercise('Yoga / mobility', [{ setType: 'Work', weightKg: 0, reps: 0, rpe: 2, failure: false }])]
  }
];

const defaultBodyGroup = name => {
  const key = name.toLowerCase();
  if (key.includes('leg curl')) return 'Hamstrings';
  if (key.includes('leg extension') || key.includes('squat') || key.includes('leg press')) return 'Quads';
  if (key.includes('calf')) return 'Calves';
  if (key.includes('tibialis')) return 'Tibialis';
  if (key.includes('curl')) return 'Biceps';
  if (key.includes('triceps') || key.includes('dip')) return 'Triceps';
  if (key.includes('rear')) return 'Rear Delts';
  if (key.includes('lateral') || key.includes('shoulder')) return 'Shoulders';
  if (key.includes('press') || key.includes('fly') || key.includes('pec')) return 'Chest';
  if (key.includes('row') || key.includes('pull')) return 'Back';
  return 'General';
};

export const exerciseLibrary = templates.flatMap(template => template.exercises.map(item => ({
  id: item.id,
  name: item.name,
  nameKey: item.name.toLowerCase(),
  workoutType: template.name,
  bodyGroup: defaultBodyGroup(item.name),
  equipment: 'Not set',
  notes: item.notes || '',
  aliases: [],
  usageCount: 0,
  source: 'demo'
}))).filter((item, index, all) => all.findIndex(other => other.nameKey === item.nameKey) === index);

export const sampleVitals = [
  {
    id: `vitals-${isoDate(-1)}`, date: isoDate(-1), recovery: 78, charge: 74, restScore: 82,
    synthesis: 'Building', hrv: 96, hrvBaseline: 90, restingHr: 54, rhrBaseline: 58,
    stress: 24, sleepHours: 7.6, sleepPerformance: 88, sleepDebt: 0.8,
    systolic: 126, diastolic: 76, weight: 92.4, feeling: 'good', symptoms: false,
    notes: 'Good energy. Mild chest soreness only.', recoveryActivities: ['Post-meal walk']
  }
];

export const sampleSessions = [
  {
    id: crypto.randomUUID(), date: isoDate(-3), startedAt: `${isoDate(-3)}T17:35:00`, completedAt: `${isoDate(-3)}T18:27:00`,
    templateId: 'chest-biceps', sessionType: 'Chest & Biceps', mode: 'normal', notes: 'Productive. No grinding.',
    exercises: [
      { id: crypto.randomUUID(), name: 'Machine chest press', notes: 'Controlled negative', sets: [
        { id: crypto.randomUUID(), setType: 'Warm-up', setNumber: 1, weightKg: 45, reps: 12, rpe: 4, failure: false, holdSeconds: 0, notes: '' },
        { id: crypto.randomUUID(), setType: 'Work', setNumber: 2, weightKg: 82.5, reps: 8, rpe: 9, failure: false, holdSeconds: 0, notes: '1 rep in reserve' }
      ]},
      { id: crypto.randomUUID(), name: 'Preacher curl', notes: '', sets: [
        { id: crypto.randomUUID(), setType: 'Warm-up', setNumber: 1, weightKg: 25, reps: 12, rpe: 4, failure: false, holdSeconds: 0, notes: '' },
        { id: crypto.randomUUID(), setType: 'Work', setNumber: 2, weightKg: 42.5, reps: 9, rpe: 9.5, failure: true, holdSeconds: 0, notes: 'Clean failure' }
      ]}
    ]
  },
  {
    id: crypto.randomUUID(), date: isoDate(-6), startedAt: `${isoDate(-6)}T17:40:00`, completedAt: `${isoDate(-6)}T18:32:00`,
    templateId: 'legs', sessionType: 'Legs', mode: 'recovery-watch', notes: 'Kept one rep in reserve. BP watch.',
    exercises: [
      { id: crypto.randomUUID(), name: 'Leg extension', notes: 'No grind', sets: [
        { id: crypto.randomUUID(), setType: 'Warm-up', setNumber: 1, weightKg: 45, reps: 12, rpe: 4, failure: false, holdSeconds: 0, notes: '' },
        { id: crypto.randomUUID(), setType: 'Work', setNumber: 2, weightKg: 66, reps: 12, rpe: 6, failure: false, holdSeconds: 2, notes: 'Controlled' }
      ]}
    ]
  }
];

export const sampleMeals = [
  {
    id: crypto.randomUUID(), date: isoDate(0), mealNumber: 1, time: '08:15',
    foods: '4 poached eggs, 2 slices sourdough, spinach', protein: 38, carbs: 40, fat: 24, calories: 530,
    sodiumNote: 'Salted normally', preWorkout: false, postWorkout: false, preBed: false
  }
];
