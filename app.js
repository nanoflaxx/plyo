// ============================================================
// NANO-GYM — app.js
// Push/Pull/Cardio · Injury tracking · Muscle fatigue
// ============================================================
//
// 📍 QUICK NAVIGATION (Function Index)
// ─────────────────────────────────────────────────────
// SECTION 0: Constants & State (~line 6-970)
// SECTION 1: Init & State Management (~line 971-1020)
// SECTION 2: Main Rendering (~line 1020-1430)
// SECTION 3: Schedule & Exercises (~line 1430-1520)
// SECTION 4: Logging & Stats (~line 1520-1950)
// SECTION 5: Injury & Muscle Recovery (~line 1950-2050)
// SECTION 6: Exercise Swaps & Modals (~line 2050-2220)
// SECTION 7: Past Workout Logging (~line 2220-2330)
// SECTION 8: Charts & Progress (~line 2330-2770)
// SECTION 9: Settings & Profile (~line 2770-2850)
// SECTION 10: Timers, Notifications, Install (~line 2850+)
// SECTION 11: Export & Utilities (~line 2900+)
// ─────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════
// AUTH SYSTEM (Device-local login, localStorage)
// ════════════════════════════════════════════════════════════
const AUTH_KEY = 'gym_users';
const CURRENT_USER_KEY = 'gym_current_user';

function hashPassword(pass) {
  let hash = 0;
  for (let i = 0; i < pass.length; i++) {
    const char = pass.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function getAllUsers() {
  const users = localStorage.getItem(AUTH_KEY);
  return users ? JSON.parse(users) : {};
}

function registerUser(username, password) {
  const users = getAllUsers();
  if (users[username]) return { ok: false, msg: 'User exists' };
  users[username] = hashPassword(password);
  localStorage.setItem(AUTH_KEY, JSON.stringify(users));
  return { ok: true, msg: 'Registered' };
}

function loginUser(username, password) {
  const users = getAllUsers();
  if (!users[username] || users[username] !== hashPassword(password)) {
    return { ok: false, msg: 'Wrong credentials' };
  }
  localStorage.setItem(CURRENT_USER_KEY, username);
  return { ok: true, msg: 'Logged in', user: username };
}

function logoutUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

function getCurrentUser() {
  return localStorage.getItem(CURRENT_USER_KEY);
}

// ═══════════════════════════════════════════════════════════
// SECTION 0: CONSTANTS & STATE OBJECT
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// DOM CACHE — Prevent repeated querySelector calls
// ═══════════════════════════════════════════════════════════
const DOM = {
  // Modal & display
  modal: document.getElementById('modal'),
  modalBody: document.getElementById('modal-body'),
  
  // Main sections
  contentArea: document.getElementById('content'),
  logBody: document.getElementById('log-body'),
  
  // Profile inputs
  profileAge: document.getElementById('profile-age'),
  profileWeight: document.getElementById('profile-weight'),
  profileHeight: document.getElementById('profile-height'),
  profileGender: document.getElementById('profile-gender'),
  profileUnit: document.getElementById('profile-unit'),
  
  // Logging
  logDuration: document.getElementById('log-duration'),
  logDistance: document.getElementById('log-distance'),
  bwInput: document.getElementById('bw-input'),
  bwUnitLbl: document.getElementById('bw-unit-lbl'),
  
  // Charts
  // chartExSelect: document.getElementById('chart-ex-select'),
  
  // Notifications & UI
  notifBtn: document.getElementById('notif-btn'),
  notifBar: document.getElementById('notif-bar'),
  installPrompt: document.getElementById('install-prompt'),
  timerDisplay: document.getElementById('timer-display'),
};
// ── CONNECTIVITY DETECTION ────────────────────────────────────
function checkConnectivity() {
  const wasOnline = S.isOnline;
  S.isOnline = navigator.onLine;
  
  // Log connectivity change
  if (wasOnline !== S.isOnline) {
    console.log(S.isOnline ? '🟢 Online' : '🔴 Offline');
  }
  
  return S.isOnline;
}

// Listen for online/offline events
window.addEventListener('online', () => {
  S.isOnline = true;
  console.log('🟢 Connection restored');
  // Try to reload Wger exercises when coming back online
  // loadExercisesFromWger().then(() => {
  //   renderSchedule();
  // }).catch(() => {
  //   renderSchedule();
  // });
});

window.addEventListener('offline', () => {
  S.isOnline = false;
  console.log('🔴 Connection lost');
});
// ── GET EXERCISE SOURCE (Online vs Offline) ────────────────────
function getExerciseSource() {
  // User manually forced offline mode
  if (S.offlineMode) {
    return 'offline';
  }
  
  // Auto-detect: if online, use Wger; if offline, use bundled DB
  if (checkConnectivity()) {
    return 'online';  // Wger API
  } else {
    return 'offline';  // Bundled DB
  }
}
// ── FETCH EXERCISES (Wger API or Offline DB) ──────────────────
async function fetchExercises(searchTerm = '') {
  const source = getExerciseSource();
  
  if (source === 'online') {
    return await fetchFromWger(searchTerm);
  } else {
    return filterOfflineExercises(searchTerm);
  }
}

// Fetch from Wger API
async function fetchFromWger(searchTerm = '') {
  try {
    // Check cache first
    if (S.exerciseCache[searchTerm]) {
      console.log('📦 Using cached exercises');
      return S.exerciseCache[searchTerm];
    }
    
    // Fetch from Wger API
    const url = searchTerm 
      ? `https://wger.de/api/v2/exercise/?search=${encodeURIComponent(searchTerm)}&language=2`
      : 'https://wger.de/api/v2/exercise/?language=2&limit=100';
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Wger API error');
    
    const data = await response.json();
    const exercises = data.results.map(ex => ({
      id: `wger-${ex.id}`,
      name: ex.name,
      muscles: ex.muscles.map(m => m.name.toLowerCase()),
      difficulty: ex.difficulty ? ex.difficulty.name.toLowerCase() : 'intermediate',
      category: 'wger'
    }));
    
    // Cache results
    S.exerciseCache[searchTerm] = exercises;
    saveState();
    
    console.log(`✅ Fetched ${exercises.length} exercises from Wger`);
    return exercises;
  } catch (err) {
    console.error('❌ Wger fetch failed:', err);
    // Fallback to offline
    return filterOfflineExercises(searchTerm);
  }
}

// ── EXERCISE ADAPTER: Convert between Wger and app formats ────────────────
function adaptWgerExercise(wgerEx) {
  // Convert Wger exercise object to app format
  // Handles both direct Wger API objects and our wrapped format
  
  if (!wgerEx) return null;
  
  // If already adapted (has our properties), return as-is
  if (wgerEx.emoji && wgerEx.sets && wgerEx.reps) return wgerEx;
  
  // Map Wger properties to app properties
  return {
    id: wgerEx.id || `wger-${wgerEx.id}`,
    name: wgerEx.name || 'Unknown Exercise',
    type: wgerEx.type || 'other',
    sets: wgerEx.sets || '3',
    reps: wgerEx.reps || '8–12',
    emoji: wgerEx.emoji || '💪',
    duration: wgerEx.duration || 5,
    muscles: wgerEx.muscles || [],
    knee_safe: wgerEx.knee_safe !== undefined ? wgerEx.knee_safe : true,
    forearm_safe: wgerEx.forearm_safe !== undefined ? wgerEx.forearm_safe : true,
    wger_id: wgerEx.wger_id || wgerEx.id,
    desc: wgerEx.desc || wgerEx.description || 'Exercise from database',
    steps: wgerEx.steps || ['Perform the exercise with proper form', 'Control the movement', 'Maintain consistent breathing'],
    alts: wgerEx.alts || []
  };
}

function adaptExerciseArray(exercises) {
  // Batch adapt an array of exercises
  if (!Array.isArray(exercises)) return [];
  return exercises.map(ex => adaptWgerExercise(ex)).filter(ex => ex !== null);
}
function categorizeWgerExerciseByCategory(categoryId) {
  // Wger category IDs (common ones):
  // 1 = Abs, 2 = Back, 3 = Biceps, 4 = Calves, 5 = Chest, 6 = Forearms,
  // 7 = Glutes, 8 = Lats, 9 = Lower back, 10 = Middle back, 11 = Neck,
  // 12 = Quads, 13 = Shoulders, 14 = Traps, 15 = Triceps, etc.
  
  const pushCategories = [5, 13, 15];  // Chest, Shoulders, Triceps
  const pullCategories = [2, 3, 8, 10, 14];  // Back, Biceps, Lats, Middle back, Traps
  const legCategories = [7, 12, 4];  // Glutes, Quads, Calves
  const coreCategories = [1, 9];  // Abs, Lower back
  
  if (pushCategories.includes(categoryId)) return 'push';
  if (pullCategories.includes(categoryId)) return 'pull';
  if (legCategories.includes(categoryId)) return 'legs';
  if (coreCategories.includes(categoryId)) return 'cardio'; // Map core to cardio for now
  
  return 'other';
}

// ── DOWNLOAD WEEKLY EXERCISES (per category) ──────────────────────
async function downloadWeeklyExercises() {
  // Skip if user manually set offline mode
  if (S.offlineMode) {
    console.log('🔌 Offline mode active - using local exercises');
    return false;
  }
  
  // Skip if no internet (but use cached pools if available)
  if (!checkConnectivity()) {
    console.log('📡 No internet - using cached exercises');
    return S.weeklyExercises && Object.keys(S.weeklyExercises).length > 0;
  }
  
  // Check if we need to refresh (14 days = 1209600000 ms for bi-weekly)
  const now = Date.now();
  const biweeklyMs = 14 * 24 * 60 * 60 * 1000;
  const isFirstBuild = !S.lastWeeklyUpdate || S.lastWeeklyUpdate === 0;
  const needsRefresh = isFirstBuild || (now - S.lastWeeklyUpdate) >= biweeklyMs;
  
  if (!needsRefresh) {
    console.log('📦 Exercise pools still fresh');
    return true;
  }
  
  try {
    console.log('⏳ Building exercise pools from cached database...');
    
    // If bi-weekly refresh (not first build), rotate 15% first
    if (!isFirstBuild) {
      console.log('🔄 Rotating 15% of exercises...');
      rotateBiweeklyExercises();
    } else {
      // First time: load and cache full DB, build pools
      await loadAndCacheYuhouasDB();
      await buildExercisePools();
    }
    
    // Log breakdown
    const breakdown = {};
    Object.entries(S.weeklyExercises).forEach(([cat, exs]) => {
      breakdown[cat] = exs.length;
    });
    console.log(`✅ Exercise pools ready`);
    console.log('📊 Pool sizes:', breakdown);
    
    return true;
    
  } catch (err) {
    console.error('❌ Failed to build exercise pools:', err);
    console.log('📚 Falling back to local exercises');
    return false;
  }
}

function rotateBiweeklyExercises() {
  // Rotate 15% of each pool with fresh exercises from cache
  if (!YUHONAS_EXERCISES_CACHE) {
    console.warn('No cached exercises available for rotation');
    return;
  }
  
  const rotationPercentage = 0.15;
  const categories = ['push', 'pull', 'legs', 'cardio', 'core', 'calisthenics', 'mobility', 
                      'cooldownPush', 'cooldownPull', 'cooldownLegs', 'cooldownCardio'];
  
  const muscleMap = {
    push: ['chest', 'shoulders', 'triceps'],
    pull: ['back', 'biceps'],
    legs: ['glutes', 'quadriceps', 'calves'],
    cardio: ['cardio'],
    core: ['abs'],
    calisthenics: ['body weight'],
    mobility: ['stretching'],
    cooldownPush: ['chest', 'shoulders', 'triceps'],
    cooldownPull: ['back', 'biceps'],
    cooldownLegs: ['glutes', 'quadriceps', 'calves'],
    cooldownCardio: ['cardio']
  };
  
  categories.forEach(cat => {
    const pool = S.weeklyExercises[cat];
    if (!pool || pool.length === 0) return;
    
    const rotateCount = Math.max(1, Math.ceil(pool.length * rotationPercentage));
    
    // Remove last rotateCount exercises
    const remaining = pool.slice(0, pool.length - rotateCount);
    
    // Get fresh exercises
    const poolSize = pool.length;
    const fresh = selectRandomFromDB(YUHONAS_EXERCISES_CACHE, muscleMap[cat] || [], rotateCount);
    
    // Append fresh to remaining
    S.weeklyExercises[cat] = [...remaining, ...fresh];
  });
  
  S.lastWeeklyUpdate = Date.now();
  saveState();
}

// Cache for entire exercises database
let YUHONAS_EXERCISES_CACHE = null;
const CACHE_VERSION_KEY = 'gym_exercises_cache_version';
const CACHE_DATA_KEY = 'gym_exercises_data';
const CACHE_CHECK_KEY = 'gym_exercises_last_check';

async function loadAndCacheYuhouasDB() {
  // Check localStorage first
  const cached = localStorage.getItem(CACHE_DATA_KEY);
  if (cached) {
    try {
      YUHONAS_EXERCISES_CACHE = JSON.parse(cached);
      console.log(`✅ Loaded ${Object.keys(YUHONAS_EXERCISES_CACHE).length} exercises from cache`);
      
      // Check for updates monthly (in background, don't block)
      checkForExerciseDBUpdates();
      return YUHONAS_EXERCISES_CACHE;
    } catch (err) {
      console.error('Cache parse error, downloading fresh');
    }
  }
  
  // If no cache, download full DB
  return await downloadFullExerciseDB();
}

async function downloadFullExerciseDB() {
  try {
    // Update overlay progress
    const overlayStatus = document.getElementById('overlay-status');
    const overlayBar = document.getElementById('overlay-bar');
    if (overlayStatus) overlayStatus.textContent = 'Downloading exercise database...';
    if (overlayBar) overlayBar.style.width = '20%';

    const response = await fetch('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json');
    if (!response.ok) throw new Error('Failed to load exercises');

    if (overlayBar) overlayBar.style.width = '70%';
    if (overlayStatus) overlayStatus.textContent = 'Building workout pools...';

    YUHONAS_EXERCISES_CACHE = await response.json();

    // Cache to localStorage
    localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(YUHONAS_EXERCISES_CACHE));
    localStorage.setItem(CACHE_CHECK_KEY, Date.now().toString());

    if (overlayBar) overlayBar.style.width = '90%';
    console.log(`✅ Downloaded and cached ${Object.keys(YUHONAS_EXERCISES_CACHE).length} exercises`);

    // Hide old progress div if present
    const progressDiv = document.getElementById('download-progress');
    if (progressDiv) progressDiv.style.display = 'none';

    return YUHONAS_EXERCISES_CACHE;
  } catch (err) {
    console.error('❌ Failed to load exercise DB:', err);
    const overlayStatus = document.getElementById('overlay-status');
    if (overlayStatus) overlayStatus.textContent = '⚠️ Failed to load. Using offline mode.';
    return {};
  }
}

async function checkForExerciseDBUpdates() {
  // Check monthly if DB has updates
  const lastCheck = localStorage.getItem(CACHE_CHECK_KEY);
  const now = Date.now();
  const monthInMs = 30 * 24 * 60 * 60 * 1000;
  
  if (lastCheck && (now - parseInt(lastCheck)) < monthInMs) {
    return; // Checked recently, skip
  }
  
  try {
    const response = await fetch('https://api.github.com/repos/yuhonas/free-exercise-db/commits?path=dist/exercises.json&per_page=1');
    if (response.ok) {
      const data = await response.json();
      if (data.length > 0) {
        const lastCommitDate = new Date(data[0].commit.author.date).getTime();
        const cacheDate = parseInt(localStorage.getItem(CACHE_CHECK_KEY) || 0);
        
        if (lastCommitDate > cacheDate) {
          console.log('📢 Exercise DB has updates, refreshing cache...');
          localStorage.removeItem(CACHE_DATA_KEY);
          await downloadFullExerciseDB();
        }
      }
    }
    localStorage.setItem(CACHE_CHECK_KEY, now.toString());
  } catch (err) {
    console.log('Could not check for updates (no internet), continuing with cache');
  }
}

async function buildExercisePools() {
  // Calculate pool sizes based on 60-minute max workout
  const poolSizes = {
    push: 25,
    pull: 25,
    legs: 25,
    cardio: 5,      // Only 1-2 per day, so small pool
    core: 10,
    calisthenics: 10,
    mobility: 8,
    cooldownPush: 3,
    cooldownPull: 3,
    cooldownLegs: 3,
    cooldownCardio: 3
  };
  
  // Load full DB if not cached
  if (!YUHONAS_EXERCISES_CACHE) {
    await loadAndCacheYuhouasDB();
  }
  
  const exercises = YUHONAS_EXERCISES_CACHE;
  if (!exercises || Object.keys(exercises).length === 0) {
    console.warn('No exercises available');
    return;
  }
  
  // Build pools by filtering from full DB
  const pools = {
    push: selectRandomFromDB(exercises, ['chest', 'shoulders', 'triceps'], poolSizes.push),
    pull: selectRandomFromDB(exercises, ['back', 'biceps'], poolSizes.pull),
    legs: selectRandomFromDB(exercises, ['glutes', 'quadriceps', 'calves'], poolSizes.legs),
    cardio: selectRandomFromDB(exercises, ['cardio'], poolSizes.cardio),
    core: selectRandomFromDB(exercises, ['abs'], poolSizes.core),
    calisthenics: selectRandomFromDB(exercises, ['body weight'], poolSizes.calisthenics),
    mobility: selectRandomFromDB(exercises, ['stretching'], poolSizes.mobility),
    cooldownPush: selectRandomFromDB(exercises, ['chest', 'shoulders', 'triceps'], poolSizes.cooldownPush),
    cooldownPull: selectRandomFromDB(exercises, ['back', 'biceps'], poolSizes.cooldownPull),
    cooldownLegs: selectRandomFromDB(exercises, ['glutes', 'quadriceps', 'calves'], poolSizes.cooldownLegs),
    cooldownCardio: selectRandomFromDB(exercises, ['cardio'], poolSizes.cooldownCardio)
  };
  
  // Store in state
  S.weeklyExercises = pools;
  S.lastWeeklyUpdate = Date.now();
  saveState();
  
  // Log breakdown
  const breakdown = {};
  Object.entries(pools).forEach(([cat, exs]) => {
    breakdown[cat] = exs.length;
  });
  console.log(`✅ Built exercise pools for bi-weekly rotation`);
  console.log('📊 Pool sizes:', breakdown);
}

function selectRandomFromDB(allExercises, targetMuscles, limit) {
  const selected = [];
  
  Object.entries(allExercises).forEach(([exName, exData]) => {
    const muscleMatch = targetMuscles.some(muscle =>
      (exData.target || '').toLowerCase().includes(muscle.toLowerCase()) ||
      (exData.bodyPart || '').toLowerCase().includes(muscle.toLowerCase())
    );
    
    if (muscleMatch) {
      const imageUrl = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${exName}/0.jpg`;
      
      selected.push({
        id: `yuhonas-${exName.replace(/\s+/g, '-')}`,
        name: exName,
        type: 'exercise',
        sets: '3',
        reps: '8–12',
        emoji: '💪',
        duration: 5,
        muscles: [exData.target || ''].filter(m => m),
        knee_safe: true,
        forearm_safe: true,
        yuhonas_name: exName,
        desc: `${exData.bodyPart || 'Exercise'} - ${exData.equipment || 'Bodyweight'}`,
        steps: [`Perform ${exName}`, 'Control the movement', 'Maintain consistent breathing'],
        bodyPart: exData.bodyPart || '',
        equipment: exData.equipment || '',
        target: exData.target || '',
        imageUrl: imageUrl
      });
    }
  });
  
  // Shuffle and return limit
  return selected.sort(() => Math.random() - 0.5).slice(0, limit);
}

function rotateWeeklyExercises() {
  // Replace 10% of each category with new exercises
  const rotationPercentage = 0.1;
  
  const categories = ['push', 'pull', 'legs', 'cardio', 'core', 'calisthenics', 'mobility', 'cooldownPush', 'cooldownPull', 'cooldownLegs', 'cooldownCardio'];
  
  categories.forEach(cat => {
    const pool = S.weeklyExercises[cat];
    if (!pool || pool.length === 0) return;
    
    const rotateCount = Math.max(1, Math.ceil(pool.length * rotationPercentage));
    
    // Remove last rotateCount exercises
    const remaining = pool.slice(0, pool.length - rotateCount);
    
    // This will be populated with fresh exercises during weekly download
    S.weeklyExercises[cat] = remaining;
  });
}

// ── LOAD EXERCISES FROM WGER ON APP START ──────────────────────
async function loadExercisesFromWger() {
  // Use downloadWeeklyExercises instead
  return await downloadWeeklyExercises();
}

// Filter offline exercises
function filterOfflineExercises(searchTerm = '') {
  if (!searchTerm) {
    console.log('📚 Using offline database');
    return OFFLINE_EXERCISES;
  }
  
  const term = searchTerm.toLowerCase();
  return OFFLINE_EXERCISES.filter(ex => 
    ex.name.toLowerCase().includes(term) || 
    ex.muscles.some(m => m.toLowerCase().includes(term))
  );
}
// ── ONBOARDING SLIDES DATA ────────────────────────────────────
const ONBOARDING_SLIDES = [
  {
    title: 'Welcome to Nano-Gym! 🤦',
    subtitle: 'Your personal AI-powered workout companion',
    content: 'Track workouts, monitor recovery, and smash your fitness goals. Let\'s get started!'
  },
  {
    title: 'Schedule Tab 📅',
    subtitle: 'Build your weekly routine',
    content: 'Choose your workout days and intensity. The app auto-generates a Push/Pull/Cardio split that adapts to your preferences.'
  },
  {
    title: 'Log Your Workouts 📝',
    subtitle: 'Record every rep and set',
    content: 'After each workout, log your exercises with weight, reps, and how you felt. Track progress over time.'
  },
  {
    title: 'Bonus System 🔥',
    subtitle: 'Add extra exercises for gains',
    content: 'Toggle bonus options (Abs, Glutes, Legs, etc.) to customize your workouts and hit specific muscle groups harder.'
  },
  {
    title: 'Profile & Settings ⚙️',
    subtitle: 'Personalize your experience',
    content: 'Enter your age, weight, height, and gender for accurate calorie tracking. Enable notifications for workout reminders.'
  },
  {
    title: 'Ready to Go! 🚀',
    subtitle: 'You\'re all set',
    content: 'Start by creating your schedule, then log your first workout. Check the Charts tab to track your progress!'
  }
];
// ── OFFLINE EXERCISE DATABASE (Medium size ~300-500KB) ────────────────────
const OFFLINE_EXERCISES = [
  // PUSH EXERCISES (Chest, Shoulders, Triceps)
  { id: 'offline-barbell-bench-press', name: 'Barbell Bench Press', muscles: ['chest', 'triceps', 'shoulders'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-dumbbell-bench-press', name: 'Dumbbell Bench Press', muscles: ['chest', 'triceps', 'shoulders'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-incline-bench-press', name: 'Incline Bench Press', muscles: ['chest', 'shoulders'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-cable-flyes', name: 'Cable Flyes', muscles: ['chest'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-push-ups', name: 'Push-ups', muscles: ['chest', 'triceps', 'shoulders'], difficulty: 'beginner', category: 'bodyweight' },
  { id: 'offline-dips', name: 'Dips', muscles: ['chest', 'triceps', 'shoulders'], difficulty: 'intermediate', category: 'bodyweight' },
  { id: 'offline-overhead-press', name: 'Overhead Press', muscles: ['shoulders', 'triceps'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-lateral-raises', name: 'Lateral Raises', muscles: ['shoulders'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-shoulder-press-machine', name: 'Shoulder Press Machine', muscles: ['shoulders', 'triceps'], difficulty: 'beginner', category: 'machine' },
  { id: 'offline-tricep-pushdowns', name: 'Tricep Pushdowns', muscles: ['triceps'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-close-grip-bench', name: 'Close Grip Bench Press', muscles: ['triceps', 'chest'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-tricep-dips', name: 'Tricep Dips', muscles: ['triceps', 'chest'], difficulty: 'intermediate', category: 'bodyweight' },
  
  // PULL EXERCISES (Back, Biceps)
  { id: 'offline-barbell-deadlift', name: 'Barbell Deadlift', muscles: ['back', 'hamstrings', 'glutes'], difficulty: 'advanced', category: 'compound' },
  { id: 'offline-pull-ups', name: 'Pull-ups', muscles: ['back', 'biceps'], difficulty: 'intermediate', category: 'bodyweight' },
  { id: 'offline-lat-pulldown', name: 'Lat Pulldown', muscles: ['back', 'biceps'], difficulty: 'beginner', category: 'machine' },
  { id: 'offline-barbell-rows', name: 'Barbell Rows', muscles: ['back', 'biceps'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-dumbbell-rows', name: 'Dumbbell Rows', muscles: ['back', 'biceps'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-cable-rows', name: 'Cable Rows', muscles: ['back', 'biceps'], difficulty: 'beginner', category: 'machine' },
  { id: 'offline-face-pulls', name: 'Face Pulls', muscles: ['back', 'shoulders'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-barbell-curls', name: 'Barbell Curls', muscles: ['biceps'], difficulty: 'intermediate', category: 'isolation' },
  { id: 'offline-dumbbell-curls', name: 'Dumbbell Curls', muscles: ['biceps'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-hammer-curls', name: 'Hammer Curls', muscles: ['biceps', 'forearms'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-cable-curls', name: 'Cable Curls', muscles: ['biceps'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-chin-ups', name: 'Chin-ups', muscles: ['back', 'biceps'], difficulty: 'intermediate', category: 'bodyweight' },
  
  // LEGS
  { id: 'offline-barbell-squats', name: 'Barbell Squats', muscles: ['quads', 'glutes', 'hamstrings'], difficulty: 'intermediate', category: 'compound' },
  { id: 'offline-leg-press', name: 'Leg Press', muscles: ['quads', 'glutes'], difficulty: 'beginner', category: 'machine' },
  { id: 'offline-lunges', name: 'Lunges', muscles: ['quads', 'glutes', 'hamstrings'], difficulty: 'intermediate', category: 'bodyweight' },
  { id: 'offline-leg-extensions', name: 'Leg Extensions', muscles: ['quads'], difficulty: 'beginner', category: 'machine' },
  { id: 'offline-leg-curls', name: 'Leg Curls', muscles: ['hamstrings'], difficulty: 'beginner', category: 'machine' },
  { id: 'offline-calf-raises', name: 'Calf Raises', muscles: ['calves'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-smith-machine-squats', name: 'Smith Machine Squats', muscles: ['quads', 'glutes'], difficulty: 'beginner', category: 'machine' },
  
  // CARDIO
  { id: 'offline-treadmill-running', name: 'Treadmill Running', muscles: ['legs', 'cardio'], difficulty: 'beginner', category: 'cardio' },
  { id: 'offline-stationary-bike', name: 'Stationary Bike', muscles: ['legs', 'cardio'], difficulty: 'beginner', category: 'cardio' },
  { id: 'offline-rowing-machine', name: 'Rowing Machine', muscles: ['back', 'legs', 'cardio'], difficulty: 'beginner', category: 'cardio' },
  { id: 'offline-jump-rope', name: 'Jump Rope', muscles: ['legs', 'cardio'], difficulty: 'beginner', category: 'cardio' },
  { id: 'offline-burpees', name: 'Burpees', muscles: ['full-body', 'cardio'], difficulty: 'intermediate', category: 'cardio' },
  { id: 'offline-mountain-climbers', name: 'Mountain Climbers', muscles: ['core', 'cardio'], difficulty: 'intermediate', category: 'cardio' },
  
  // CORE
  { id: 'offline-crunches', name: 'Crunches', muscles: ['abs'], difficulty: 'beginner', category: 'isolation' },
  { id: 'offline-planks', name: 'Planks', muscles: ['core', 'abs'], difficulty: 'intermediate', category: 'bodyweight' },
  { id: 'offline-ab-wheel', name: 'Ab Wheel Rollout', muscles: ['abs', 'core'], difficulty: 'advanced', category: 'isolation' },
  { id: 'offline-hanging-leg-raises', name: 'Hanging Leg Raises', muscles: ['abs', 'core'], difficulty: 'intermediate', category: 'bodyweight' },
  // COOLDOWN STRETCHES
  { id: 'cooldown-push', name: 'Push Day Cooldown', type: 'cooldown', emoji: '🧘', sets: '1', reps: '5–8 min', duration: 5, muscles: ['chest', 'shoulders', 'triceps'], desc: 'Cool down after push.', steps: ['Stretch chest', 'Stretch shoulders', 'Breathe deeply'], alts: [] },
  { id: 'cooldown-pull', name: 'Pull Day Cooldown', type: 'cooldown', emoji: '🧘', sets: '1', reps: '5–8 min', duration: 5, muscles: ['back', 'biceps'], desc: 'Cool down after pull.', steps: ['Stretch back', 'Stretch biceps', 'Relax'], alts: [] },
  { id: 'cooldown-cardio', name: 'Cardio Cooldown', type: 'cooldown', emoji: '🧘', sets: '1', reps: '5–8 min', duration: 5, muscles: ['legs', 'cardio'], desc: 'Cool down after cardio.', steps: ['Stretch legs', 'Walk slowly', 'Breathe'], alts: [] },
  { id: 'cooldown-rest', name: 'Rest Day Cooldown', type: 'cooldown', emoji: '🧘', sets: '1', reps: '5–8 min', duration: 5, muscles: ['full-body'], desc: 'Easy mobility work.', steps: ['Light stretching', 'Foam rolling', 'Relax'], alts: [] },
];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MUSCLE_RECOVERY_HOURS = 48;

// ── FIX #2: Declare deferredInstallPrompt at top scope ──────
let deferredInstallPrompt = null;

// ── STRETCHES DATABASE ────────────────────────────────────
const STRETCHES_DATA = {
  'chest': [
    {
      name: 'Doorway Chest Stretch',
      duration: '30 sec each side',
      steps: [
        'Stand in a doorway with arm raised 90°',
        'Step through until you feel a stretch in chest',
        'Keep shoulders relaxed, lean gently forward',
        'Breathe deeply, hold without bouncing'
      ]
    },
    {
      name: 'Cross-Body Chest Stretch',
      duration: '30 sec each side',
      steps: [
        'Stand or sit, bring one arm across your body',
        'Use other hand to gently pull elbow toward chest',
        'Feel stretch across front of shoulder and chest',
        'Repeat on both sides'
      ]
    }
  ],
  'shoulders': [
    {
      name: 'Shoulder Rolls',
      duration: '10 circles each direction',
      steps: [
        'Stand tall with arms at sides',
        'Roll shoulders backward slowly: up, back, down, forward',
        'Do 10 circles backward, then 10 forward',
        'Move smoothly and controlled'
      ]
    },
    {
      name: 'Thread the Needle',
      duration: '30 sec each side',
      steps: [
        'Get on all fours on ground',
        'Thread one arm under your body, resting on shoulder',
        'Sit hips back gently toward heels',
        'Feel deep shoulder stretch, breathe calmly'
      ]
    }
  ],
  'back': [
    {
      name: 'Cat-Cow Stretch',
      duration: '10 reps',
      steps: [
        'Get on all fours with hands under shoulders',
        'Arch back, look up (cow position)',
        'Round spine, tuck chin (cat position)',
        'Flow between positions smoothly'
      ]
    },
    {
      name: 'Child\'s Pose',
      duration: '45 sec',
      steps: [
        'Kneel on ground, big toes together, knees wide',
        'Fold forward, forehead to ground, arms extended',
        'Feel stretch through entire back and shoulders',
        'Breathe deeply and relax'
      ]
    }
  ],
  'biceps': [
    {
      name: 'Doorway Bicep Stretch',
      duration: '30 sec each arm',
      steps: [
        'Stand in doorway, arm at 90° on frame',
        'Step forward until bicep feels stretched',
        'Keep arm straight, rotate body away gently',
        'No bouncing, steady hold'
      ]
    }
  ],
  'triceps': [
    {
      name: 'Overhead Tricep Stretch',
      duration: '30 sec each side',
      steps: [
        'Raise one arm overhead, bend elbow',
        'Use other hand to gently press elbow down',
        'Keep shoulders relaxed, feel back of arm stretch',
        'Breathe, don\'t force it'
      ]
    }
  ],
  'forearm': [
    {
      name: 'Wrist Flexor Stretch',
      duration: '30 sec each side',
      steps: [
        'Extend arm in front, palm up',
        'Use other hand to gently pull fingers back',
        'Feel stretch along inside of forearm',
        'Hold, breathe, repeat other side'
      ]
    }
  ],
  'legs': [
    {
      name: 'Quad Stretch',
      duration: '30 sec each leg',
      steps: [
        'Stand on one leg, pull other foot toward glutes',
        'Keep knees together, don\'t arch back',
        'Feel stretch on front of thigh',
        'Balance using wall if needed'
      ]
    },
    {
      name: 'Hamstring Stretch',
      duration: '45 sec',
      steps: [
        'Sit on ground with one leg extended',
        'Bend other leg, fold toward straight leg',
        'Hinge at hips, reach toward toes',
        'Feel stretch behind thigh, no bouncing'
      ]
    }
  ],
  'glutes': [
    {
      name: 'Figure-4 Stretch',
      duration: '45 sec each side',
      steps: [
        'Lie on back, one knee bent, one leg crossed over',
        'Pull bottom knee toward chest gently',
        'Feel deep glute stretch',
        'Breathe, relax into stretch'
      ]
    }
  ],
  'calves': [
    {
      name: 'Wall Calf Stretch',
      duration: '30 sec each leg',
      steps: [
        'Face wall, hands on wall at eye level',
        'Step one leg back, keep heel on ground',
        'Lean forward, feel stretch in calf',
        'Keep back leg straight'
      ]
    }
  ],
  'hips': [
    {
      name: 'Hip Flexor Stretch',
      duration: '30 sec each side',
      steps: [
        'Kneel on one knee, step other foot forward',
        'Lower hips forward and down',
        'Feel stretch on front of hip of back leg',
        'Keep torso upright'
      ]
    }
  ]
};

const EXERCISES = [
  // ── PUSH DAY ──────────────────────────────────────────────
  {
    id: 'warmup', name: 'Warmup: Row / Elliptical / Bike',
    type: 'warmup', sets: '1', reps: '5–10 min', emoji: '🏃',
    duration: 10,
    muscles: ['cardio', 'full body'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Start every session with 5–10 min of light cardio. Pick rowing machine, elliptical, or stationary bike — whatever feels best today.',
    steps: [
      'Set resistance to a comfortable level (3–5 out of 10)',
      'Maintain a steady pace — not a sprint, aim for light sweat',
      'Breathe through your nose and mouth steadily',
      'Last 2 minutes: slightly pick up pace, then ease back down'
    ],
    alts: [
      { name: 'March in place + arm circles', int: 'lower', type: 'bodyweight' },
      { name: 'Jump rope', int: 'higher', type: 'bodyweight' },
      { name: 'Treadmill brisk walk', int: 'same', type: 'machine' }
    ]
  },
  {
  id: 'incline-db-press', name: 'Incline Dumbbell Press',
  type: 'push', sets: '3', reps: '10–12', emoji: '🪜',
  duration: 5,
  muscles: ['chest', 'anterior deltoid', 'triceps'],
  knee_safe: true, forearm_safe: false,
  wger_id: null,
  desc: 'Upper chest toning and definition.',
  steps: [
    'Set bench to 30–45 degree incline',
    'Hold dumbbells at shoulder height',
    'Press up and slightly forward',
    'Lower with control'
  ],
  alts: [{ name: 'Incline barbell press', int: 'same', type: 'barbell' }]
},
{
  id: 'tricep-dips', name: 'Tricep Dips',
  type: 'push', sets: '3', reps: '8–12', emoji: '🪑',
  duration: 4,
  muscles: ['triceps', 'chest'],
  knee_safe: true, forearm_safe: false,
  wger_id: null,
  desc: 'Arm toning and definition.',
  steps: [
    'Hold bars with straight arms',
    'Lower body until elbows 90 degrees',
    'Push back up explosively',
    'Squeeze triceps at top'
  ],
  alts: [{ name: 'Assisted dips', int: 'lower', type: 'machine' }]
},
{
  id: 'cable-fly', name: 'Cable Chest Fly',
  type: 'push', sets: '3', reps: '12–15', emoji: '🔗',
  duration: 4,
  muscles: ['chest'],
  knee_safe: true, forearm_safe: true,
  wger_id: null,
  desc: 'Chest isolation and toning.',
  steps: [
    'Stand in center, arms out with slight bend',
    'Squeeze handles together in front',
    'Hold briefly, control the return',
    'High reps = maximum burn'
  ],
  alts: [{ name: 'Machine chest fly', int: 'same', type: 'machine' }]
},
{
  id: 'tricep-pushdown', name: 'Tricep Pushdowns',
  type: 'push', sets: '3', reps: '12–15', emoji: '⬇️',
  duration: 3,
  muscles: ['triceps'],
  knee_safe: true, forearm_safe: true,
  wger_id: null,
  desc: 'Tricep definition and toning.',
  steps: [
    'Grab rope/bar at chest height',
    'Keep elbows stationary',
    'Push down until arms straight',
    'Control the return'
  ],
  alts: [{ name: 'Overhead tricep extension', int: 'same', type: 'free weights' }]
},
{
  id: 'machine-shoulder-press', name: 'Machine Shoulder Press',
  type: 'push', sets: '3', reps: '10–12', emoji: '🤖',
  duration: 5,
  muscles: ['shoulders', 'triceps'],
  knee_safe: true, forearm_safe: false,
  wger_id: null,
  desc: 'Shoulder toning with stability.',
  steps: [
    'Adjust seat so handles align with shoulders',
    'Press forward and up',
    'Control return to start',
    'Keep core tight'
  ],
  alts: [{ name: 'Dumbbell shoulder press', int: 'same', type: 'free weights' }]
},
  {
    id: 'bench', name: 'Bench Press',
    type: 'push', sets: '3', reps: '8–12', emoji: '🏋️',
    duration: 5,
    muscles: ['chest', 'anterior deltoid', 'triceps'], knee_safe: true, forearm_safe: false,
    wger_id: 192,
    desc: 'Horizontal push for chest toning. Burns calories, defines pectoral muscles.',
    steps: [
      'Lie flat on bench, grip just wider than shoulder-width',
      'Unrack bar and lower to mid-chest with 3-second control',
      'Press up explosively — do not fully lock elbows at the top',
      'Feet flat on floor, slight natural back arch, shoulders packed down'
    ],
    alts: [
      { name: 'Push-ups', int: 'lower', type: 'bodyweight' },
      { name: 'Dumbbell chest press', int: 'same', type: 'free weights' },
      { name: 'Chest press machine', int: 'same', type: 'machine' },
      { name: 'Incline dumbbell press', int: 'higher', type: 'free weights' }
    ]
  },
  {
    id: 'ohpress', name: 'Overhead Press',
    type: 'push', sets: '3', reps: '8–10', emoji: '🙌',
    muscles: ['shoulders', 'triceps', 'upper traps'], knee_safe: true, forearm_safe: false,
    duration: 5,
    wger_id: 196,
    desc: 'Vertical push for shoulder definition. High-rep toning and fat-burning.',
    steps: [
      'Stand or sit, grip shoulder-width, bar resting on front of shoulders',
      'Brace core tight — press overhead in a straight line',
      'At top: slight shrug to load upper traps — full lockout optional',
      'Lower with control back to shoulder height'
    ],
    alts: [
      { name: 'Pike push-ups', int: 'lower', type: 'bodyweight' },
      { name: 'Dumbbell shoulder press', int: 'same', type: 'free weights' },
      { name: 'Shoulder press machine (seated)', int: 'same', type: 'machine' }
    ]
  },
  {
    id: 'latraise', name: 'Lateral Raises',
    type: 'push', sets: '3', reps: '12–15', emoji: '🦅',
    duration: 5,
    muscles: ['lateral deltoid'], knee_safe: true, forearm_safe: true,
    wger_id: 163,
    desc: 'Isolation for the side deltoids. Go lighter than you think — the slow lowering phase is where the gains happen.',
    steps: [
      'Stand, dumbbells at sides, slight forward lean at hips',
      'Raise arms to shoulder height — lead with elbows, not wrists',
      'Think about "pouring a glass of water" at the top',
      'Lower slowly over 3 seconds — resist gravity all the way down'
    ],
    alts: [
      { name: 'Resistance band lateral raise', int: 'lower', type: 'band' },
      { name: 'Cable lateral raise', int: 'same', type: 'machine' }
    ]
  },
  {
    id: 'tricep', name: 'Tricep Pushdown',
    type: 'push', sets: '3', reps: '12–15', emoji: '💪',
    duration: 5,
    muscles: ['triceps'], knee_safe: true, forearm_safe: false,
    wger_id: 176,
    desc: 'Cable or resistance band tricep isolation. Use the rope attachment for a neutral grip.',
    steps: [
      'Set cable pulley high, attach rope or straight bar',
      'Elbows locked tight at sides — only forearms move',
      'Push down until arms are fully straight, squeeze at the bottom',
      'Return slowly: 2 sec down, 3 sec up'
    ],
    alts: [
      { name: 'Diamond push-ups', int: 'lower', type: 'bodyweight' },
      { name: 'Overhead tricep extension', int: 'same', type: 'free weights' },
      { name: 'Tricep dips (bench)', int: 'higher', type: 'bodyweight' }
    ]
  },
  {
    id: 'legpress', name: 'Leg Press',
    type: 'push', sets: '3', reps: '10–12', emoji: '🦵',
    duration: 5,
    muscles: ['quads', 'glutes', 'hamstrings'], knee_safe: true, forearm_safe: true,
    wger_id: 227,
    desc: 'Knee-friendly compound leg builder. The machine supports your knee better than free squats. Never lock your knees at the top.',
    steps: [
      'Sit in machine, feet shoulder-width on mid-platform',
      'Lower the platform slowly — stop when knees reach ~90°',
      'Push through your heels back to start — never fully lock knees',
      'Keep lower back pressed flat into the pad throughout'
    ],
    alts: [
      { name: 'Wall sit (hold 30–60 sec)', int: 'lower', type: 'bodyweight' },
      { name: 'Goblet squat with dumbbell', int: 'same', type: 'free weights' },
      { name: 'Step-ups with light weight', int: 'same', type: 'bodyweight' }
    ]
  },
  {
    id: 'glutebridge', name: 'Glute Bridge',
    type: 'push', sets: '3', reps: '15', emoji: '🍑',
    duration: 5,
    muscles: ['glutes', 'hamstrings', 'core'], knee_safe: true, forearm_safe: true,
    wger_id: 99,
    desc: 'Excellent knee-safe glute activator. Also strengthens the knee stabilizers.',
    steps: [
      'Lie on back, knees bent ~90°, feet flat on the floor',
      'Drive hips up by squeezing your glutes hard',
      'Hold 1–2 seconds at the top — body is straight from hip to shoulder',
      'Lower slowly, do not let hips touch floor between reps'
    ],
    alts: [
      { name: 'Donkey kicks (quadruped)', int: 'lower', type: 'bodyweight' },
      { name: 'Single-leg glute bridge', int: 'higher', type: 'bodyweight' },
      { name: 'Hip thrust machine', int: 'higher', type: 'machine' }
    ]
  },
  {
    id: 'pushstretch', name: 'Cool-down Stretch',
    type: 'cooldown', sets: '1', reps: '5–8 min', emoji: '🧘',
    duration: 5,
    muscles: ['chest', 'shoulders', 'triceps', 'quads', 'hip flexors'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Static stretching after push day. Reduces soreness, improves flexibility.',
    steps: [
      'Doorframe chest stretch: arms at 90°, lean forward — 30 sec each side',
      'Overhead tricep stretch: arm overhead, hand behind head — 30 sec each arm',
      'Standing quad stretch: hold ankle to glute — 30 sec each',
      'Kneeling hip flexor lunge: back knee on floor, lean forward — 45 sec each',
      'Child\'s pose: arms extended forward, breathe into lower back — 60 sec'
    ],
    alts: []
  },

  // ── PULL DAY ──────────────────────────────────────────────
  {
    // FIX: Reuse warmup id variant for pull — keeping warmup2 for schedule filtering
    id: 'warmup2', name: 'Warmup: Row / Elliptical / Bike',
    type: 'warmup', sets: '1', reps: '5–10 min', emoji: '🏃',
    duration: 5,
    muscles: ['cardio', 'full body'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Rowing is especially good before pull day as it warms up the lats and posterior chain.',
    steps: [
      '5–10 min moderate cardio — rowing is ideal before pull day',
      'Get heart rate up to a conversational pace',
      'Add some shoulder circles and torso rotations at the end'
    ],
    alts: [
      { name: 'Arm swings + torso rotations', int: 'lower', type: 'bodyweight' },
      { name: 'Treadmill walk/jog', int: 'same', type: 'machine' }
    ]
  },
  {
  id: 'barbell-row', name: 'Barbell Rows',
  type: 'pull', sets: '3', reps: '6–8', emoji: '📦',
  duration: 5,
  muscles: ['back', 'lats', 'biceps'],
  knee_safe: true, forearm_safe: false,
  wger_id: null,
  desc: 'Back definition and strength.',
  steps: [
    'Bend knees, grab bar shoulder-width',
    'Row bar to lower chest',
    'Squeeze shoulder blades together',
    'Control the descent'
  ],
  alts: [{ name: 'Dumbbell row', int: 'same', type: 'free weights' }]
},
{
  id: 'assisted-pullups', name: 'Assisted Pull-ups',
  type: 'pull', sets: '3', reps: '6–10', emoji: '🙌',
  duration: 4,
  muscles: ['back', 'lats', 'biceps'],
  knee_safe: true, forearm_safe: false,
  wger_id: null,
  desc: 'Back and arm toning.',
  steps: [
    'Grip bar shoulder-width',
    'Use machine assistance to pull up',
    'Get chin over bar',
    'Control lower'
  ],
  alts: [{ name: 'Negative pull-ups', int: 'lower', type: 'bodyweight' }]
},
{
  id: 'reverse-pec-deck', name: 'Reverse Pec Deck',
  type: 'pull', sets: '3', reps: '12–15', emoji: '🔙',
  duration: 3,
  muscles: ['rear deltoid', 'back'],
  knee_safe: true, forearm_safe: true,
  wger_id: null,
  desc: 'Rear shoulder and upper back toning.',
  steps: [
    'Sit facing machine',
    'Grab handles with straight arms',
    'Pull back, squeeze shoulder blades',
    'High reps for definition'
  ],
  alts: [{ name: 'Dumbbell reverse fly', int: 'same', type: 'free weights' }]
},
{
  id: 'cable-rows', name: 'Cable Rows',
  type: 'pull', sets: '3', reps: '10–12', emoji: '🔗',
  duration: 4,
  muscles: ['back', 'lats'],
  knee_safe: true, forearm_safe: true,
  wger_id: null,
  desc: 'Back toning and lat development.',
  steps: [
    'Sit, grab handle, slight knee bend',
    'Row handle to chest',
    'Squeeze back at peak',
    'Control return'
  ],
  alts: [{ name: 'Seated row machine', int: 'same', type: 'machine' }]
},
  {
    id: 'latpull', name: 'Lat Pulldown',
    type: 'pull', sets: '3', reps: '10–12', emoji: '⬇️',
    duration: 5,
    muscles: ['lats', 'biceps', 'rear delts'], knee_safe: true, forearm_safe: false,
    wger_id: 122,
    desc: 'Vertical pull pattern. Builds lat width and bicep strength.',
    steps: [
      'Sit, grab bar just wider than shoulder-width',
      'Keep chest up, pull bar to upper chest with elbows driving back',
      'Full range: arms nearly straight at top, elbows tucked at bottom',
      'Squeeze shoulder blades together for 1 sec at the bottom'
    ],
    alts: [
      { name: 'Pull-ups (assisted)', int: 'lower', type: 'bodyweight' },
      { name: 'Resistance band pull-downs', int: 'same', type: 'band' },
      { name: 'Lat pulldown (machine)', int: 'same', type: 'machine' }
    ]
  },
  {
    id: 'bentrow', name: 'Bent-Over Barbell Row',
    type: 'pull', sets: '3', reps: '8–10', emoji: '📦',
    duration: 5,
    muscles: ['lats', 'middle back', 'biceps'], knee_safe: true, forearm_safe: false,
    wger_id: 25,
    desc: 'Horizontal pull. Builds back thickness and posterior chain strength.',
    steps: [
      'Hip-hinge forward, knees slightly bent, bar hangs at shin',
      'Drive elbows back, pull bar to lower chest, squeeze shoulder blades',
      'Keep chest up, torso angle ~45°, lower with control',
      'Do not let lower back round'
    ],
    alts: [
      { name: 'Dumbbell rows (single-arm)', int: 'lower', type: 'free weights' },
      { name: 'Machine row (chest-supported)', int: 'same', type: 'machine' },
      { name: 'Resistance band rows', int: 'lower', type: 'band' }
    ]
  },
  {
    id: 'facepull', name: 'Face Pulls',
    type: 'pull', sets: '3', reps: '15–20', emoji: '👀',
    duration: 5,
    muscles: ['rear delts', 'upper back', 'rotator cuff'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Isolation for rear delts and rotator cuff health. HIGH reps, light weight.',
    steps: [
      'Set cable to eye level, use rope attachment',
      'Pull rope toward your face, flare elbows wide',
      'At the top, spread rope apart to engage rear delts fully',
      'Squeeze for 1 sec, lower with control'
    ],
    alts: [
      { name: 'Resistance band pull-aparts', int: 'lower', type: 'band' },
      { name: 'Reverse pec-deck machine', int: 'same', type: 'machine' }
    ]
  },
  {
    id: 'bicurl', name: 'Barbell Bicep Curl',
    type: 'pull', sets: '3', reps: '8–12', emoji: '💪',
    duration: 5,
    muscles: ['biceps'], knee_safe: true, forearm_safe: false,
    wger_id: 58,
    desc: 'Direct bicep isolation. Strict form only — no swinging.',
    steps: [
      'Stand, EZ-bar or straight bar at hip height, elbows locked at sides',
      'Curl weight up with biceps — only forearms move',
      'Squeeze hard at the top, lower slowly over 2–3 seconds',
      'Stop just past 90° elbow bend at the top'
    ],
    alts: [
      { name: 'Dumbbell curls (alternating)', int: 'same', type: 'free weights' },
      { name: 'Preacher curls', int: 'same', type: 'machine' },
      { name: 'Machine bicep curl', int: 'same', type: 'machine' }
    ]
  },
  {
    id: 'pullstretch', name: 'Cool-down Stretch',
    type: 'cooldown', sets: '1', reps: '5–8 min', emoji: '🧘',
    duration: 5,
    muscles: ['lats', 'back', 'biceps', 'shoulders'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Static stretching after pull day. Focus on lats and back mobility.',
    steps: [
      'Lat stretch: arms overhead, lean to one side — 30 sec each',
      'Child\'s pose: arms extended, breathe into the stretch — 60 sec',
      'Thread the needle: lying twist, pull knee across body — 30 sec each',
      'Shoulder stretch: cross arm over chest, gently pull — 30 sec each'
    ],
    alts: []
  },

  // ── CARDIO DAY ──────────────────────────────────────────────
  {
    id: 'cardio-run', name: 'Treadmill Run',
    type: 'cardio', sets: '1', reps: '20–30 min', emoji: '🏃‍♂️',
    duration: 5,
    muscles: ['cardio', 'quads', 'hamstrings', 'glutes', 'calves'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Steady-state running for cardiovascular fitness.',
    steps: [
      'Warm up with 3 min easy jog',
      'Run at 60–70% max heart rate (conversational pace)',
      'Maintain steady breathing throughout',
      'Cool down with 2 min easy walk'
    ],
    alts: [
      { name: 'Outdoor running', int: 'same', type: 'bodyweight' },
      { name: 'Track running', int: 'same', type: 'bodyweight' },
      { name: 'Trail running', int: 'higher', type: 'bodyweight' }
    ]
  },
  {
  id: 'stairmaster', name: 'Stairmaster / Stair Climber',
  type: 'cardio', sets: '1', reps: '15–30 min', emoji: '🪜',
  duration: 20,
  muscles: ['glutes', 'quads', 'cardio'],
  knee_safe: false, forearm_safe: true,
  wger_id: null,
  desc: 'Glute and leg toning. High calorie burn.',
  steps: [
    'Step at steady pace',
    'Maintain consistent cadence',
    'Lean slightly forward',
    'Avoid holding handrails'
  ],
  alts: [{ name: 'Stair walk', int: 'lower', type: 'bodyweight' }]
},
{
  id: 'rowing-machine', name: 'Rowing Machine',
  type: 'cardio', sets: '1', reps: '15–30 min', emoji: '🚣',
  duration: 20,
  muscles: ['back', 'cardio', 'full body'],
  knee_safe: true, forearm_safe: true,
  wger_id: null,
  desc: 'Full-body cardio. Great for fat loss.',
  steps: [
    'Sit, feet secured on pedals',
    'Grip handle with straight arms',
    'Drive legs, lean back slightly, pull handle',
    'Reverse smoothly'
  ],
  alts: [{ name: 'Assisted rowing', int: 'lower', type: 'machine' }]
},
{
  id: 'jump-rope', name: 'Jump Rope',
  type: 'cardio', sets: '1', reps: '10–20 min', emoji: '🔗',
  duration: 15,
  muscles: ['cardio', 'legs', 'full body'],
  knee_safe: false, forearm_safe: true,
  wger_id: null,
  desc: 'Maximum fat burn. Requires no equipment.',
  steps: [
    'Hold rope at hips',
    'Jump on balls of feet',
    'Keep wrists relaxed',
    'Maintain steady rhythm'
  ],
  alts: [{ name: 'High knees', int: 'lower', type: 'bodyweight' }]
},
  {
    id: 'cardio-bike', name: 'Stationary Bike',
    type: 'cardio', sets: '1', reps: '25–35 min', emoji: '🚴',
    duration: 5,
    muscles: ['cardio', 'quads', 'hamstrings', 'glutes', 'core'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Low-impact cardio. Easy on the knees, great for active recovery.',
    steps: [
      'Adjust seat height so legs are nearly straight at bottom',
      'Start with light resistance, warm up for 3 min',
      'Increase resistance gradually until conversational pace',
      'Cool down with 2 min easy pedaling'
    ],
    alts: [
      { name: 'Assault/Echo bike', int: 'higher', type: 'machine' },
      { name: 'Outdoor cycling', int: 'same', type: 'bodyweight' },
      { name: 'Rowing machine', int: 'same', type: 'machine' }
    ]
  },
  {
    id: 'cardio-row', name: 'Rowing Machine',
    type: 'cardio', sets: '1', reps: '20–25 min', emoji: '🚣',
    duration: 5,
    muscles: ['cardio', 'back', 'lats', 'shoulders', 'legs', 'core'], knee_safe: true, forearm_safe: false,
    wger_id: null,
    desc: 'Full-body cardio workout. Excellent for back and cardiovascular fitness.',
    steps: [
      'Sit with feet in straps, knees bent, arms extended',
      'Warm up for 3 min at easy pace',
      'Drive with legs first, then lean back, then pull arms',
      'Reverse: extend arms, lean forward, bend knees'
    ],
    alts: [
      { name: 'C2 Concept2 rower', int: 'same', type: 'machine' },
      { name: 'Water rower', int: 'same', type: 'machine' },
      { name: 'Stair climber', int: 'higher', type: 'machine' }
    ]
  },
  {
    id: 'cardio-walk', name: 'Incline Treadmill Walk',
    type: 'cardio', sets: '1', reps: '30–45 min', emoji: '🚶',
    duration: 5,
    muscles: ['cardio', 'glutes', 'hamstrings', 'core'], knee_safe: true, forearm_safe: true,
    wger_id: null,
    desc: 'Low-intensity active recovery. Great for fat loss without much fatigue.',
    steps: [
      'Set treadmill to 5–10% incline, easy pace',
      'Walk at conversational pace for 30–45 minutes',
      'Maintain upright posture — no hand holding',
      'Keep heart rate at 60–65% max'
    ],
    alts: [
      { name: 'Outdoor hill walk', int: 'same', type: 'bodyweight' },
      { name: 'Staircase walk', int: 'higher', type: 'bodyweight' },
      { name: 'Elliptical', int: 'lower', type: 'machine' }
    ]
  }
];
// ── BODYWEIGHT DAY ──────────────────────────────────────────────
const BODYWEIGHT_EXERCISES = [
  {
    id: 'bw-push-ups', name: 'Push-ups',
    type: 'bodyweight', sets: '3', reps: '10–20', emoji: '💪',
    duration: 5,
    muscles: ['chest', 'shoulders', 'triceps'],
    wger_id: null,
    desc: 'Upper body toning, no equipment needed.',
    steps: ['Hands shoulder-width', 'Lower chest to ground', 'Push back up'],
    alts: [{ name: 'Wall push-ups', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'bw-dips', name: 'Chair Dips',
    type: 'bodyweight', sets: '3', reps: '8–12', emoji: '🪑',
    duration: 5,
    muscles: ['triceps', 'chest'],
    wger_id: null,
    desc: 'Tricep toning with just a chair.',
    steps: ['Hands on chair behind you', 'Lower body down', 'Push back up'],
    alts: [{ name: 'Bench dips', int: 'same', type: 'bodyweight' }]
  },
  {
    id: 'bw-squats', name: 'Bodyweight Squats',
    type: 'bodyweight', sets: '3', reps: '15–20', emoji: '🦵',
    duration: 5,
    muscles: ['quads', 'glutes'],
    wger_id: null,
    desc: 'Leg and glute toning.',
    steps: ['Feet shoulder-width', 'Lower hips back', 'Push through heels'],
    alts: [{ name: 'Wall sit', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'bw-lunges', name: 'Lunges',
    type: 'bodyweight', sets: '3', reps: '12–15', emoji: '👟',
    duration: 5,
    muscles: ['quads', 'glutes', 'hamstrings'],
    wger_id: null,
    desc: 'Full leg definition.',
    steps: ['Step forward', 'Lower back knee', 'Push back to start'],
    alts: [{ name: 'Reverse lunges', int: 'same', type: 'bodyweight' }]
  },
  {
    id: 'bw-plank', name: 'Plank Hold',
    type: 'bodyweight', sets: '3', reps: '30–60 sec', emoji: '📏',
    duration: 5,
    muscles: ['abs', 'core'],
    wger_id: null,
    desc: 'Core toning and stability.',
    steps: ['Elbow plank position', 'Keep body straight', 'Hold steady'],
    alts: [{ name: 'Wall plank', int: 'lower', type: 'bodyweight' }]
  }
];
// ── BONUS EXERCISES FOR WORKOUT OPTIONS ────────────────
const BONUS_CORE = [
  {
    id: 'core-ab-rollout', name: 'Ab Wheel Rollout',
    type: 'core', sets: '3', reps: '8–12', emoji: '🌀',
    duration: 5,
    muscles: ['abs', 'obliques'], 
    wger_id: null,
    desc: 'Core toning. Develops visible ab definition.',
    steps: [
      'Kneel on ground, wheel in front of you',
      'Roll forward, engaging core tightly',
      'Pull back to start, keeping abs engaged throughout'
    ],
    alts: [{ name: 'Plank hold', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'core-hanging-leg-raise', name: 'Hanging Leg Raises',
    type: 'core', sets: '3', reps: '10–15', emoji: '🙌',
    duration: 5,
    muscles: ['abs', 'hip flexors'],
    wger_id: null,
    desc: 'Lower ab focus. High-rep toning for definition.',
    steps: [
      'Hang from bar with straight arms',
      'Raise legs to 90 degrees, control the movement',
      'Lower slowly, don\'t swing'
    ],
    alts: [{ name: 'Knee raises', int: 'lower', type: 'machine' }]
  }
];

const BONUS_CARDIO_FINISHERS = [
  {
    id: 'cardio-burpees', name: 'Burpees (Fat-Burning)',
    type: 'cardio', sets: '3', reps: '15–20', emoji: '💥',
    duration: 5,
    muscles: ['full body', 'cardio'],
    wger_id: null,
    desc: 'Maximum fat-burning finisher. Full-body toning.',
    steps: [
      'Stand tall, drop to plank position',
      'Do one push-up',
      'Jump feet back to squat, jump up explosively'
    ],
    alts: [{ name: 'Modified burpees (no jump)', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'cardio-mountain-climbers', name: 'Mountain Climbers',
    type: 'cardio', sets: '3', reps: '30 sec', emoji: '⛰️',
    duration: 5,
    muscles: ['cardio', 'core', 'shoulders'],
    wger_id: null,
    desc: 'Core + cardio combo. Burns fat while toning.',
    steps: [
      'Start in plank position',
      'Alternate driving knees toward chest quickly',
      'Keep hips level, maintain steady pace'
    ],
    alts: [{ name: 'Slow mountain climbers', int: 'lower', type: 'bodyweight' }]
  }
];
const BONUS_GLUTES = [
  {
    id: 'glutes-hip-thrust', name: 'Hip Thrusts',
    type: 'glutes', sets: '3', reps: '12–15', emoji: '🍑',
    duration: 5,
    muscles: ['glutes', 'quads'],
    wger_id: null,
    desc: 'Glute toning. Builds shapely, defined glutes.',
    steps: [
      'Sit with back against bench, knees bent',
      'Drive hips up, squeeze glutes at top',
      'Lower with control, repeat'
    ],
    alts: [{ name: 'Single-leg hip thrust', int: 'higher', type: 'bodyweight' }]
  },
  {
    id: 'glutes-leg-press', name: 'Leg Press (Glute Focus)',
    type: 'glutes', sets: '3', reps: '12–15', emoji: '🦵',
    duration: 5,
    muscles: ['glutes', 'quads'],
    wger_id: null,
    desc: 'Full leg and glute definition.',
    steps: [
      'Feet shoulder-width, slightly forward on platform',
      'Lower until 90 degrees, drive up explosively',
      'Squeeze glutes at top'
    ],
    alts: [{ name: 'Goblet squat', int: 'lower', type: 'free weights' }]
  }
];

const BONUS_CALISTHENICS = [
  {
    id: 'cal-push-ups', name: 'Push-ups',
    type: 'calisthenics', sets: '3', reps: '10–20', emoji: '💪',
    duration: 5,
    muscles: ['chest', 'shoulders', 'triceps'],
    wger_id: null,
    desc: 'Bodyweight strength and toning.',
    steps: [
      'Hands shoulder-width, body straight',
      'Lower chest to ground, elbows at 45 degrees',
      'Push back up explosively'
    ],
    alts: [{ name: 'Wall push-ups', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'cal-dips', name: 'Dips (Triceps Focus)',
    type: 'calisthenics', sets: '3', reps: '8–12', emoji: '🤸',
    duration: 5,
    muscles: ['triceps', 'chest', 'shoulders'],
    wger_id: null,
    desc: 'Arm toning and upper body definition.',
    steps: [
      'Hold bars, arms straight',
      'Lower body until elbows 90 degrees',
      'Push back up, squeeze triceps'
    ],
    alts: [{ name: 'Bench dips', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'cal-pull-ups', name: 'Pull-ups',
    type: 'calisthenics', sets: '3', reps: '5–12', emoji: '⬆️',
    duration: 5,
    muscles: ['back', 'biceps', 'shoulders'],
    wger_id: null,
    desc: 'Build back and bicep strength.',
    steps: [
      'Grip bar slightly wider than shoulder-width',
      'Pull body up until chin over bar',
      'Lower with control'
    ],
    alts: [{ name: 'Assisted pull-ups', int: 'lower', type: 'calisthenics' }]
  },
  {
    id: 'cal-chin-ups', name: 'Chin-ups',
    type: 'calisthenics', sets: '3', reps: '5–12', emoji: '⬆️',
    duration: 5,
    muscles: ['back', 'biceps'],
    wger_id: null,
    desc: 'Bicep and lat focused pulling.',
    steps: [
      'Grip bar shoulder-width, palms facing you',
      'Pull body up until chin over bar',
      'Lower with control'
    ],
    alts: [{ name: 'Scapular pull-ups', int: 'lower', type: 'calisthenics' }]
  },
  {
    id: 'cal-squats', name: 'Bodyweight Squats',
    type: 'calisthenics', sets: '3', reps: '15–25', emoji: '🦵',
    duration: 4,
    muscles: ['quads', 'glutes', 'hamstrings'],
    wger_id: null,
    desc: 'Lower body strength without equipment.',
    steps: [
      'Stand with feet shoulder-width apart',
      'Lower hips back and down',
      'Drive through heels to stand'
    ],
    alts: [{ name: 'Wall sits', int: 'lower', type: 'calisthenics' }]
  },
  {
    id: 'cal-lunges', name: 'Lunges',
    type: 'calisthenics', sets: '3', reps: '10–15', emoji: '🚶',
    duration: 5,
    muscles: ['quads', 'glutes', 'hamstrings'],
    wger_id: null,
    desc: 'Single leg strength and balance.',
    steps: [
      'Step forward with one leg',
      'Lower hips until rear knee near ground',
      'Push back to start, alternate'
    ],
    alts: [{ name: 'Reverse lunges', int: 'same', type: 'calisthenics' }]
  },
  {
    id: 'cal-planks', name: 'Planks',
    type: 'calisthenics', sets: '3', reps: '20–60s', emoji: '📍',
    duration: 4,
    muscles: ['core', 'abs', 'shoulders'],
    wger_id: null,
    desc: 'Core stability and strength.',
    steps: [
      'Forearms on ground, elbows under shoulders',
      'Body in straight line',
      'Hold without hips sagging'
    ],
    alts: [{ name: 'Side plank', int: 'same', type: 'calisthenics' }]
  },
  {
    id: 'cal-burpees', name: 'Burpees',
    type: 'calisthenics', sets: '3', reps: '8–12', emoji: '⚡',
    duration: 6,
    muscles: ['full body', 'cardio'],
    wger_id: null,
    desc: 'Full body explosive movement.',
    steps: [
      'Start standing, drop to plank',
      'Do one push-up',
      'Jump feet to hands, jump up'
    ],
    alts: [{ name: 'Modified burpees', int: 'lower', type: 'calisthenics' }]
  },
  {
    id: 'cal-mountain-climbers', name: 'Mountain Climbers',
    type: 'calisthenics', sets: '3', reps: '20–30', emoji: '🏔️',
    duration: 5,
    muscles: ['core', 'cardio', 'legs'],
    wger_id: null,
    desc: 'Core and cardio combination.',
    steps: [
      'Start in plank position',
      'Bring knee to chest alternately',
      'Keep hips level, move quickly'
    ],
    alts: [{ name: 'Slow mountain climbers', int: 'lower', type: 'calisthenics' }]
  },
  {
    id: 'cal-tricep-dips-bench', name: 'Tricep Dips (Bench)',
    type: 'calisthenics', sets: '3', reps: '8–15', emoji: '💪',
    duration: 4,
    muscles: ['triceps', 'chest', 'shoulders'],
    wger_id: null,
    desc: 'Tricep focused dips using bench.',
    steps: [
      'Hands on bench behind you',
      'Lower body by bending elbows',
      'Push back up, squeeze triceps'
    ],
    alts: [{ name: 'Knee dips', int: 'lower', type: 'calisthenics' }]
  },
  {
    id: 'cal-hanging-leg-raises', name: 'Hanging Leg Raises',
    type: 'calisthenics', sets: '3', reps: '8–15', emoji: '🔗',
    duration: 5,
    muscles: ['abs', 'core', 'hip flexors'],
    wger_id: null,
    desc: 'Advanced core and ab strength.',
    steps: [
      'Hang from bar with straight arms',
      'Lift legs to horizontal or higher',
      'Lower with control'
    ],
    alts: [{ name: 'Knee raises', int: 'lower', type: 'calisthenics' }]
  }
];
// Additional bonus exercises
const BONUS_CORE_ADVANCED = [
  {
    id: 'core-decline-situps', name: 'Decline Sit-ups',
    type: 'core', sets: '3', reps: '12–15', emoji: '📐',
    duration: 4,
    muscles: ['abs', 'core'],
    wger_id: null,
    desc: 'Advanced ab definition. Maximum burn.',
    steps: [
      'Set bench to decline position',
      'Lock feet at top',
      'Crunch up slowly, engage core',
      'Lower with control'
    ],
    alts: [{ name: 'Regular sit-ups', int: 'lower', type: 'bodyweight' }]
  }
];

const BONUS_CARDIO_ADVANCED = [
  {
    id: 'cardio-battle-ropes', name: 'Battle Ropes',
    type: 'cardio', sets: '3', reps: '30 sec', emoji: '🌊',
    duration: 3,
    muscles: ['cardio', 'shoulders', 'core'],
    wger_id: null,
    desc: 'Extreme fat-burning finisher.',
    steps: [
      'Hold rope end in each hand',
      'Create waves by moving arms up/down',
      'Go all out for 30 seconds',
      'Rest 30 seconds, repeat'
    ],
    alts: [{ name: 'Jump rope', int: 'lower', type: 'bodyweight' }]
  }
];
// ── BONUS MOBILITY EXERCISES (6 categories) ────────────────────────────────
const BONUS_MOBILITY = [
  // SHOULDER MOBILITY (6 exercises)
  { id: 'mob-shoulder-pass-through', name: 'Shoulder Pass-Through', type: 'mobility', sets: '3', reps: '12-15', emoji: '⭕', duration: 3, muscles: ['shoulders', 'chest'], desc: 'Improves shoulder joint mobility and range of motion.' },
  { id: 'mob-arm-circles', name: 'Arm Circles', type: 'mobility', sets: '2', reps: '20 each direction', emoji: '⭕', duration: 2, muscles: ['shoulders'], desc: 'Warm-up and mobility for shoulder joint.' },
  { id: 'mob-shoulder-dislocates', name: 'Shoulder Dislocates', type: 'mobility', sets: '3', reps: '10-12', emoji: '⭕', duration: 3, muscles: ['shoulders', 'back'], desc: 'Deep shoulder mobility work.' },
  { id: 'mob-wall-slides', name: 'Wall Slides', type: 'mobility', sets: '3', reps: '12-15', emoji: '⭕', duration: 3, muscles: ['shoulders', 'chest'], desc: 'Posture and shoulder mobility.' },
  { id: 'mob-thread-needle', name: 'Thread the Needle', type: 'mobility', sets: '2', reps: '10 each side', emoji: '⭕', duration: 3, muscles: ['shoulders', 'chest'], desc: 'Deep shoulder stretch and mobility.' },
  { id: 'mob-reverse-snow-angels', name: 'Reverse Snow Angels', type: 'mobility', sets: '3', reps: '15-20', emoji: '⭕', duration: 3, muscles: ['shoulders', 'back'], desc: 'Activates rear delts and improves shoulder mobility.' },

  // HIP MOBILITY (6 exercises)
  { id: 'mob-90-90-stretch', name: '90/90 Hip Stretch', type: 'mobility', sets: '2', reps: '30-45 sec each', emoji: '🔷', duration: 4, muscles: ['hips', 'glutes'], desc: 'Deep hip flexor and external rotator stretch.' },
  { id: 'mob-world-greatest-stretch', name: 'World\'s Greatest Stretch', type: 'mobility', sets: '2', reps: '5-8 each side', emoji: '🔷', duration: 4, muscles: ['hips', 'back', 'shoulders'], desc: 'Full-body mobility combining multiple movements.' },
  { id: 'mob-pigeon-pose', name: 'Pigeon Pose', type: 'mobility', sets: '2', reps: '45-60 sec each', emoji: '🔷', duration: 4, muscles: ['hips', 'glutes'], desc: 'Deep hip flexor and glute stretch.' },
  { id: 'mob-cossack-squat', name: 'Cossack Squat', type: 'mobility', sets: '3', reps: '10-12 each side', emoji: '🔷', duration: 3, muscles: ['hips', 'legs'], desc: 'Lateral hip mobility and leg strength.' },
  { id: 'mob-hip-circles', name: 'Hip Circles', type: 'mobility', sets: '2', reps: '10 each direction', emoji: '🔷', duration: 2, muscles: ['hips'], desc: 'Warms up hip joint and improves mobility.' },
  { id: 'mob-deep-bodyweight-squat', name: 'Deep Bodyweight Squat', type: 'mobility', sets: '2', reps: '15-20', emoji: '🔷', duration: 3, muscles: ['hips', 'legs', 'ankles'], desc: 'Full-body lower body mobility.' },

  // SPINE/THORACIC MOBILITY (6 exercises)
  { id: 'mob-cat-cow', name: 'Cat-Cow Stretch', type: 'mobility', sets: '2', reps: '10-12', emoji: '🐱', duration: 3, muscles: ['spine', 'back'], desc: 'Spinal flexion and extension mobility.' },
  { id: 'mob-thoracic-rotation', name: 'Thoracic Rotation', type: 'mobility', sets: '3', reps: '10 each side', emoji: '🐱', duration: 3, muscles: ['spine', 'back'], desc: 'Improves thoracic spine rotation.' },
  { id: 'mob-child-pose', name: 'Child\'s Pose', type: 'mobility', sets: '1', reps: '60 sec', emoji: '🐱', duration: 2, muscles: ['spine', 'back', 'shoulders'], desc: 'Stretches entire back and relaxes spine.' },
  { id: 'mob-cobra-stretch', name: 'Cobra Stretch', type: 'mobility', sets: '2', reps: '30 sec each', emoji: '🐱', duration: 2, muscles: ['spine', 'chest'], desc: 'Spinal extension and chest opener.' },
  { id: 'mob-superman-hold', name: 'Superman Hold', type: 'mobility', sets: '3', reps: '20-30 sec', emoji: '🐱', duration: 3, muscles: ['spine', 'back'], desc: 'Strengthens back extensors and improves posture.' },
  { id: 'mob-dead-bug', name: 'Dead Bug', type: 'mobility', sets: '3', reps: '10-12 each side', emoji: '🐱', duration: 3, muscles: ['core', 'spine'], desc: 'Core stability and spinal control.' },

  // ANKLE MOBILITY (6 exercises)
  { id: 'mob-ankle-circles', name: 'Ankle Circles', type: 'mobility', sets: '2', reps: '15 each direction', emoji: '🦶', duration: 2, muscles: ['ankles'], desc: 'Warms up ankle joint.' },
  { id: 'mob-calf-stretch', name: 'Calf Stretch', type: 'mobility', sets: '2', reps: '45 sec each', emoji: '🦶', duration: 2, muscles: ['calves', 'ankles'], desc: 'Stretches calves and improves ankle dorsiflexion.' },
  { id: 'mob-downward-dog', name: 'Downward Dog', type: 'mobility', sets: '2', reps: '45-60 sec', emoji: '🦶', duration: 3, muscles: ['calves', 'hamstrings', 'shoulders'], desc: 'Full-body stretch with ankle mobility benefits.' },
  { id: 'mob-shin-stretch', name: 'Shin Stretch', type: 'mobility', sets: '2', reps: '30 sec each', emoji: '🦶', duration: 2, muscles: ['shins', 'ankles'], desc: 'Stretches anterior tibialis and top of foot.' },
  { id: 'mob-toes-to-nose', name: 'Toes-to-Nose Stretch', type: 'mobility', sets: '2', reps: '30 sec each', emoji: '🦶', duration: 2, muscles: ['hamstrings', 'ankles'], desc: 'Hamstring and ankle mobility.' },
  { id: 'mob-ankle-flexion-extension', name: 'Ankle Flexion-Extension', type: 'mobility', sets: '3', reps: '15-20 each', emoji: '🦶', duration: 2, muscles: ['ankles'], desc: 'Full ankle range of motion.' },

  // WRIST MOBILITY (6 exercises)
  { id: 'mob-wrist-circles', name: 'Wrist Circles', type: 'mobility', sets: '2', reps: '15 each direction', emoji: '✋', duration: 2, muscles: ['wrists'], desc: 'Warms up wrist joint.' },
  { id: 'mob-wrist-flexion-extension', name: 'Wrist Flexion-Extension', type: 'mobility', sets: '2', reps: '12-15 each', emoji: '✋', duration: 2, muscles: ['wrists', 'forearms'], desc: 'Improves wrist range of motion.' },
  { id: 'mob-prayer-stretch', name: 'Prayer Stretch', type: 'mobility', sets: '2', reps: '30 sec', emoji: '✋', duration: 2, muscles: ['wrists', 'forearms'], desc: 'Stretches wrist flexors.' },
  { id: 'mob-reverse-prayer', name: 'Reverse Prayer Stretch', type: 'mobility', sets: '2', reps: '30 sec', emoji: '✋', duration: 2, muscles: ['wrists', 'forearms'], desc: 'Stretches wrist extensors.' },
  { id: 'mob-finger-flexion', name: 'Finger Flexion-Extension', type: 'mobility', sets: '2', reps: '15-20', emoji: '✋', duration: 2, muscles: ['wrists', 'hands'], desc: 'Hand and finger dexterity.' },
  { id: 'mob-doorway-chest-shoulder', name: 'Doorway Chest & Shoulder', type: 'mobility', sets: '2', reps: '30 sec each side', emoji: '✋', duration: 2, muscles: ['wrists', 'chest', 'shoulders'], desc: 'Stretches chest, shoulders, and wrist flexors.' },

  // FULL-BODY MOBILITY FLOW (6 exercises)
  { id: 'mob-inchworm', name: 'Inchworm', type: 'mobility', sets: '2', reps: '8-10', emoji: '🌀', duration: 3, muscles: ['full-body', 'hamstrings', 'shoulders'], desc: 'Dynamic full-body mobility and warm-up.' },
  { id: 'mob-quadruped-rotations', name: 'Quadruped Rotations', type: 'mobility', sets: '3', reps: '8-10 each side', emoji: '🌀', duration: 3, muscles: ['spine', 'shoulders', 'hips'], desc: 'Full-body rotational mobility.' },
  { id: 'mob-bear-crawl', name: 'Bear Crawl', type: 'mobility', sets: '2', reps: '20-30 sec', emoji: '🌀', duration: 3, muscles: ['full-body'], desc: 'Dynamic mobility and shoulder stability.' },
  { id: 'mob-sun-salutation', name: 'Sun Salutation Flow', type: 'mobility', sets: '2', reps: '5-8 reps', emoji: '🌀', duration: 4, muscles: ['full-body'], desc: 'Classic yoga flow for full-body mobility.' },
  { id: 'mob-flow-transitions', name: 'Flow Transitions', type: 'mobility', sets: '3', reps: '60-90 sec', emoji: '🌀', duration: 4, muscles: ['full-body'], desc: 'Smooth transitions between mobility positions.' },
  { id: 'mob-breathing-routine', name: 'Deep Breathing Routine', type: 'mobility', sets: '1', reps: '60 sec', emoji: '🌀', duration: 3, muscles: ['core', 'breathing'], desc: 'Diaphragmatic breathing for recovery and relaxation.' }
];

const BONUS_LEGS = [
  {
    id: 'legs-squats', name: 'Barbell Squats',
    type: 'legs', sets: '3', reps: '8–10', emoji: '⬇️',
    duration: 5,
    muscles: ['quads', 'glutes', 'hamstrings'],
    wger_id: null,
    desc: 'King of leg exercises. Full lower body compound.',
    steps: [
      'Load barbell on shoulders',
      'Feet shoulder-width apart',
      'Lower hips back and down until thighs parallel',
      'Drive through heels to stand'
    ],
    alts: [{ name: 'Goblet squats', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'legs-leg-press', name: 'Leg Press',
    type: 'legs', sets: '3', reps: '10–12', emoji: '🦵',
    duration: 4,
    muscles: ['quads', 'glutes'],
    wger_id: null,
    desc: 'Machine-based leg strength. Easier on back than squats.',
    steps: [
      'Sit in machine with back against pad',
      'Place feet shoulder-width on platform',
      'Lower weight until knees ~90°',
      'Push through heels to extend'
    ],
    alts: [{ name: 'Hack squats', int: 'lower', type: 'machine' }]
  },
  {
    id: 'legs-lunges', name: 'Lunges',
    type: 'legs', sets: '3', reps: '10 each leg', emoji: '🚶',
    duration: 4,
    muscles: ['quads', 'glutes', 'hamstrings'],
    wger_id: null,
    desc: 'Single-leg balance work. Unilateral strength building.',
    steps: [
      'Step forward with one leg',
      'Lower hips until back knee nearly touches floor',
      'Front knee stays over ankle',
      'Push back to start, alternate legs'
    ],
    alts: [{ name: 'Walking lunges', int: 'same', type: 'bodyweight' }]
  },
  {
    id: 'legs-leg-extensions', name: 'Leg Extensions',
    type: 'legs', sets: '3', reps: '12–15', emoji: '🔻',
    duration: 3,
    muscles: ['quads'],
    wger_id: null,
    desc: 'Isolation for quad definition. Machine-based.',
    steps: [
      'Sit in extension machine',
      'Place feet under the foot pad',
      'Extend legs fully against resistance',
      'Control on the way down'
    ],
    alts: [{ name: 'Sissy squats', int: 'lower', type: 'bodyweight' }]
  },
  {
    id: 'legs-leg-curls', name: 'Leg Curls',
    type: 'legs', sets: '3', reps: '10–12', emoji: '🎯',
    duration: 3,
    muscles: ['hamstrings', 'glutes'],
    wger_id: null,
    desc: 'Hamstring isolation. Essential for balance.',
    steps: [
      'Lie face down on leg curl machine',
      'Place feet under the roller pads',
      'Curl legs up toward glutes',
      'Control the eccentric (lowering) phase'
    ],
    alts: [{ name: 'Nordic hamstring curls', int: 'higher', type: 'bodyweight' }]
  },
  {
    id: 'legs-calf-raises', name: 'Calf Raises',
    type: 'legs', sets: '4', reps: '15–20', emoji: '🤏',
    duration: 2,
    muscles: ['calves'],
    wger_id: null,
    desc: 'Calf definition. High reps for endurance.',
    steps: [
      'Stand tall holding dumbbells or on machine',
      'Rise up onto toes, lifting heels high',
      'Squeeze calves at the top',
      'Lower with control'
    ],
    alts: [{ name: 'Seated calf raises', int: 'lower', type: 'machine' }]
  },
  {
    id: 'legs-smith-machine-squats', name: 'Smith Machine Squats',
    type: 'legs', sets: '3', reps: '8–10', emoji: '🏋️',
    duration: 5,
    muscles: ['quads', 'glutes', 'hamstrings'],
    wger_id: null,
    desc: 'Barbell squat alternative. Fixed bar path, safer.',
    steps: [
      'Position bar across shoulders in machine',
      'Feet shoulder-width apart',
      'Lower body by bending at hips and knees',
      'Drive up through heels'
    ],
    alts: [{ name: 'Barbell squats', int: 'higher', type: 'compound' }]
  }
];
// ── EXERCISE LOOKUP MAP (includes bonus exercises) ────────
function getEX_MAP() {
  return Object.fromEntries([...EXERCISES, ...BONUS_CORE, ...BONUS_CARDIO_FINISHERS, ...BONUS_GLUTES, ...BONUS_CALISTHENICS, ...BONUS_CORE_ADVANCED, ...BONUS_CARDIO_ADVANCED, ...BONUS_LEGS, ...BONUS_MOBILITY].map(e => [e.id, e]));
}
// ── STATE ──────────────────────────────────────────────────
let S = {
  userName: 'Friend',
  days: 4,
  customDays: [true, true, false, true, true, false, false],
  calisthenicsDay: [false, false, false, false, false, false, false],
  workoutLength: 45,  // default
  injuries: [],
  unit: 'kg',
  log: [],
  bwLog: [],
  progress: [],
  notifEnabled: false,
  sessionSwaps: {},
  profile: {
    age: 25,
    weight: 75,
    height: 180,
    gender: 'male'
  },
  workoutOptions: {
    moreAbs: false,
    moreCardio: false,
    moreMobility: false,
    moreGlutes: false,
    moreCalisthenics: false,
    moreLegs: false
  },
  loggedToday: [],
  hasSeenOnboarding: true,
  selectedRoutine: 'split4day',
  isOnline: navigator.onLine,
  offlineMode: false,  // User can force offline
  exerciseCache: {},   // Cache for Wger exercises
  dailyExercisePlan: {}, // Keyed by "dayIdx-YYYY-MM-DD", stores max exercise list
  weeklyExercises: {   // Weekly pool of Wger exercises
    push: [],
    pull: [],
    legs: [],
    cardio: [],
    core: [],
    calisthenics: [],
    mobility: [],
    cooldownPush: [],
    cooldownPull: [],
    cooldownLegs: [],
    cooldownCardio: []
  },
  lastWeeklyUpdate: 0  // Timestamp of last weekly download
};

// ════════════════════════════════════════════════════════════
// PROGRESS TRACKER (Weight, PRs, charts)
// ════════════════════════════════════════════════════════════
function logProgressEntry(exerciseId, weight, reps, date = new Date().toISOString().split('T')[0]) {
  const entry = { exerciseId, weight, reps, date, timestamp: Date.now() };
  if (!S.progress) S.progress = [];
  S.progress.push(entry);
  saveState();
  return entry;
}

function getProgressByExercise(exerciseId) {
  if (!S.progress) return [];
  return S.progress.filter(p => p.exerciseId === exerciseId).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getProgressStats(exerciseId) {
  const entries = getProgressByExercise(exerciseId);
  if (entries.length === 0) return null;
  
  const weights = entries.map(e => parseFloat(e.weight)).filter(w => !isNaN(w));
  const maxWeight = Math.max(...weights);
  const avgWeight = weights.length > 0 ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1) : 0;
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  
  return {
    total: entries.length,
    maxWeight,
    avgWeight,
    firstDate: firstEntry.date,
    lastDate: lastEntry.date,
    improvement: (maxWeight - parseFloat(firstEntry.weight)).toFixed(1)
  };
}

function renderProgressChart(exerciseId) {
  const entries = getProgressByExercise(exerciseId);
  if (entries.length === 0) return '<p style="color:var(--text-secondary);">No progress data yet</p>';
  
  const maxWeight = Math.max(...entries.map(e => parseFloat(e.weight)));
  const chart = entries.map(e => {
    const pct = (parseFloat(e.weight) / maxWeight) * 100;
    return `<div style="display:flex;gap:8px;align-items:center;margin:4px 0;font-size:12px;">
      <span style="width:60px;color:var(--text-secondary);">${e.date}</span>
      <div style="flex:1;height:20px;background:var(--brand-light);border-radius:4px;width:${pct}%;"></div>
      <span>${e.weight}${S.unit}</span>
    </div>`;
  }).join('');
  
  return `<div>${chart}</div>`;
}

// ════════════════════════════════════════════════════════════
// PRESET ROUTINES (4-day split config)
// ════════════════════════════════════════════════════════════
const PRESET_ROUTINES = {
  split4day: {
    name: '4-Day Push/Pull/Plyo',
    description: 'Strength + Explosive Power Split',
    days: [
      { dayIdx: 0, name: 'Lower Strength', focus: 'legs', exercises: ['legpress', 'glutebridge'] },
      { dayIdx: 1, name: 'Plyo/Cardio', focus: 'cardio', exercises: ['warmup2'] },
      { dayIdx: 2, name: 'Upper Strength', focus: 'push', exercises: ['benchpress', 'ohpress'] },
      { dayIdx: 4, name: 'Full-Body Plyo', focus: 'mixed', exercises: ['barbell-row'] }
    ]
  },
  pushpull: {
    name: 'Push/Pull/Legs',
    description: 'Classic 3-day bodybuilding split',
    days: [
      { dayIdx: 0, name: 'Push Day', focus: 'push', exercises: ['benchpress', 'ohpress', 'tricep'] },
      { dayIdx: 2, name: 'Pull Day', focus: 'pull', exercises: ['barbell-row', 'assisted-pullups'] },
      { dayIdx: 4, name: 'Leg Day', focus: 'legs', exercises: ['legpress', 'glutebridge'] }
    ]
  }
};

function applyPresetRoutine(routineKey) {
  const routine = PRESET_ROUTINES[routineKey];
  if (!routine) {
    console.warn('Routine not found:', routineKey);
    return false;
  }
  
  // Reset all days to false
  S.customDays = [false, false, false, false, false, false, false];
  
  // Enable only routine days
  routine.days.forEach(day => {
    S.customDays[day.dayIdx] = true;
  });
  
  // Store selected routine
  S.selectedRoutine = routineKey;
  S.days = routine.days.length;
  
  saveState();
  renderAll();
  
  console.log(`✅ Applied routine: ${routine.name}`);
  return true;
}

function getPresetRoutines() {
  return Object.entries(PRESET_ROUTINES).map(([key, routine]) => ({
    key,
    ...routine
  }));
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: INITIALIZATION & STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════

function dismissLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  const bar = document.getElementById('overlay-bar');
  if (bar) bar.style.width = '100%';
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 400);
  }, 300);
}

async function init() {
  // Check auth first
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showAuthModal();
    return;
  }
  
  loadState();
  S.notifEnabled = localStorage.getItem('gym_notif') === 'true';
  if (S.notifEnabled && DOM.notifBtn) DOM.notifBtn.textContent = 'Enabled ✓';

  // Skip Wger loading - use local exercises only
  // try {
  //   await loadExercisesFromWger();
  // } catch (e) {
  //   console.warn('Exercise load failed, continuing with local', e);
  // }

  // Render app fully before dismissing overlay
  renderAll();
  loadProfileUI();
  setupInstallPrompt();
  document.getElementById('unit-sel').value = S.unit;
  // updateConnectivityStatus();

  // Dismiss overlay immediately
  dismissLoadingOverlay();
  // if (!S.hasSeenOnboarding) {
  //   setTimeout(() => showOnboarding(), 450);
  // }
}

function loadState() {
  const saved = localStorage.getItem('gym_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      S = { ...S, ...parsed };
      // Restore selectedDay (bare variable, not on S)
      if (parsed.selectedDay !== undefined) _selectedDay = parsed.selectedDay;
    } catch (e) {
      console.warn('Failed to parse saved state', e);
    }
  }
  try {
    S.log      = JSON.parse(localStorage.getItem('gym_log')      || '[]');
    S.bwLog    = JSON.parse(localStorage.getItem('gym_bw')       || '[]');
    S.progress = JSON.parse(localStorage.getItem('gym_progress') || '[]');
  } catch (e) {
    S.log = []; S.bwLog = []; S.progress = [];
    console.warn('Corrupt log data cleared', e);
  }
}

function saveState() {
  localStorage.setItem('gym_state', JSON.stringify({
    userName:         S.userName,
    days:             S.days,
    customDays:       S.customDays,
    calisthenicsDay:  S.calisthenicsDay,
    injuries:         S.injuries,
    unit:             S.unit,
    profile:          S.profile,
    workoutOptions:   S.workoutOptions,
    workoutLength:    S.workoutLength,
    selectedDay:      _selectedDay,
    hasSeenOnboarding: S.hasSeenOnboarding,
    dailyExercisePlan: S.dailyExercisePlan,
    selectedRoutine:   S.selectedRoutine
  }));
  localStorage.setItem('gym_log',      JSON.stringify(S.log));
  localStorage.setItem('gym_bw',       JSON.stringify(S.bwLog));
  localStorage.setItem('gym_progress', JSON.stringify(S.progress));
}
// ── EXERCISE DURATION ─────────────────────────────────────────────
function getExerciseDuration(ex, dayExercises) {
  const totalBaseDuration = dayExercises.reduce((sum, e) => sum + (e.duration || 5), 0);
  const baseProportion = (ex.duration || 5) / totalBaseDuration;
  const scaledDuration = Math.round(S.workoutLength * baseProportion);
  return Math.max(1, scaledDuration); // At least 1 min
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: MAIN RENDERING
// ═══════════════════════════════════════════════════════════

function renderAll() {
  renderGreeting();
  renderWeekStrip();
  renderSchedule();
  renderDaysSelector();
  // renderMuscles();
  renderLog();
  renderBWHistory();
  updateStats();
}

// ── GREETING ───────────────────────────────────────────────
function renderGreeting() {
  const hour    = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const streak  = getStreak();

  let streakMsg = '';
  if      (streak >= 30) streakMsg = `${streak} days 🔥 Absolutely unstoppable!`;
  else if (streak >= 14) streakMsg = `${streak} days 🔥 Two week warrior!`;
  else if (streak >= 7)  streakMsg = `${streak} days 🔥 One week strong!`;
  else if (streak >= 3)  streakMsg = `${streak} days 🔥 Keep it going!`;
  else if (streak >= 1)  streakMsg = `${streak} day streak 🔥`;

  document.getElementById('greeting').textContent =
    `${greeting}, ${S.userName}! 💪${streakMsg ? '  ' + streakMsg : ''}`;
}

// ── USER PROFILE ───────────────────────────────────────────
function editUserName() {
  const newName = prompt('Your name:', S.userName);
  if (newName && newName.trim()) {
    S.userName = newName.trim();
    document.getElementById('user-header').textContent = S.userName + ' 💪';
    saveState();
    renderGreeting();
  }
}

function loadProfileUI() {
  // Load profile values into UI - with safety checks
  if (DOM.profileAge) DOM.profileAge.value = S.profile.age;
  if (DOM.profileWeight) DOM.profileWeight.value = S.profile.weight;
  if (DOM.profileHeight) DOM.profileHeight.value = S.profile.height;
  if (DOM.profileGender) DOM.profileGender.value = S.profile.gender;
  if (DOM.profileUnit) DOM.profileUnit.value = S.unit === 'lbs' ? 'lbs' : 'kg';
  const workoutLength = document.getElementById('workout-length');
  if (workoutLength) workoutLength.value = S.workoutLength;
  
  // Load workout options
 // document.getElementById('opt-abs').checked = S.workoutOptions.moreAbs;
  //document.getElementById('opt-cardio').checked = S.workoutOptions.moreCardio;
  //document.getElementById('opt-stretch').checked = S.workoutOptions.moreStretching;
  //document.getElementById('opt-glutes').checked = S.workoutOptions.moreGlutes;
//document.getElementById('opt-calisthenics').checked = S.workoutOptions.moreCalisthenics;
}

function saveProfile() {
  const age = parseInt(DOM.profileAge.value);
  const weight = parseFloat(DOM.profileWeight.value);
  const height = parseInt(DOM.profileHeight.value);
  const gender = DOM.profileGender.value;
  
  if (!age || age < 15 || !weight || weight < 30 || !height || height < 100) {
    alert('Please enter valid values:\n- Age: 15–100\n- Weight: 30+\n- Height: 100+');
    return;
  }
  
  S.profile = { age, weight, height, gender };
  saveState();
  alert('✅ Profile saved! Calorie calculations updated.');
}

function toggleWorkoutOption(option) {
  const buttonMap = {
    'moreAbs': 'opt-abs-btn',
    'moreCardio': 'opt-cardio-btn',
    'moreMobility': 'opt-mobility-btn',
    'moreGlutes': 'opt-glutes-btn',
    'moreCalisthenics': 'opt-calisthenics-btn',
    'moreLegs': 'opt-legs-btn'
  };
  
  // Toggle state
  S.workoutOptions[option] = !S.workoutOptions[option];
  saveState();
  renderSchedule();
  
  // Update button UI
  const btn = document.getElementById(buttonMap[option]);
  const isActive = S.workoutOptions[option];
  const statusSpan = btn.querySelector('.bonus-status');
  
  if (isActive) {
    btn.classList.add('bonus-btn-active');
    btn.style.opacity = '1';
    statusSpan.textContent = 'ON';
    statusSpan.style.color = 'var(--brand)';
  } else {
    btn.classList.remove('bonus-btn-active');
    btn.style.opacity = '0.5';
    statusSpan.textContent = 'OFF';
    statusSpan.style.color = 'var(--text-secondary)';
  }
}

function updateProfileUnit() {
  const unit = DOM.profileUnit.value;
  S.unit = unit;
  DOM.bwUnitLbl.textContent = unit;
  saveState();
  renderLog();
  renderBWHistory();
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: SCHEDULE & EXERCISES
// ═══════════════════════════════════════════════════════════

function todayIdx() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function getSched() {
  const sched = new Array(7).fill('rest');
  const pattern = ['push', 'pull', 'cardio'];
  let patternIdx = 0;
  for (let i = 0; i < 7; i++) {
    if (S.customDays[i]) {
      sched[i] = pattern[patternIdx % pattern.length];
      patternIdx++;
    }
  }
  return sched;
}

// ── WEEK STRIP ─────────────────────────────────────────────
function renderWeekStrip() {
  const today = new Date();
  const weekStart = new Date(today);
  const dayOfWeek = (today.getDay() + 6) % 7;
  weekStart.setDate(today.getDate() - dayOfWeek + (_weekOffset * 7));
  
  const navBtnStyle = `padding:8px 10px;flex-shrink:0;font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-weight:600;color:var(--text);-webkit-tap-highlight-color:transparent`;
  let html = `<div style="display:flex;gap:6px;align-items:center;padding:8px;background:var(--bg-secondary);border-radius:var(--radius-lg)">
    <div onclick="_weekOffset--;renderWeekStrip();renderSchedule()" style="${navBtnStyle}">←</div>
    <div style="flex:1;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch">`;
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const isToday = d.toDateString() === today.toDateString();
    const isSelected = _selectedDay === i;
    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
    const dayName = DAYS_SHORT[i];
    const sched = getSched();
    const type = sched[i];
    const emoji = { push: '💪', pull: '⬇️', cardio: '🏃', rest: '😴' }[type];
    
    html += `<div onclick="selectDay(${i})" style="padding:8px 4px;background:${isToday ? 'var(--brand)' : 'var(--bg)'};color:${isToday ? '#fff' : 'var(--text)'};border:${isSelected ? '2px solid var(--brand)' : '1px solid var(--border)'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:44px;flex:1;max-width:72px;flex-shrink:0;scroll-snap-align:start;-webkit-tap-highlight-color:transparent">
      <span style="font-size:15px">${emoji}</span>
      <span>${dayName}</span>
      <span style="font-size:9px;opacity:0.8">${dateStr}</span>
    </div>`;
  }
  
  html += `</div><div onclick="_weekOffset++;renderWeekStrip();renderSchedule()" style="${navBtnStyle}">→</div></div>`;
  document.getElementById('week-strip').innerHTML = html;
}

// ── SCHEDULE ───────────────────────────────────────────────
let _selectedDay = null;
function selectDay(dayIndex) {
  _selectedDay = dayIndex;
  saveState();
  renderWeekStrip();
  renderSchedule();
}

// ── DAILY EXERCISE PLAN ────────────────────────────────────
// Generates once per day at MAX exercise count. renderSchedule slices by workoutLength.
const MAX_EXERCISE_COUNT = 12; // matches 90min count
const MAX_BONUS_COUNT = 3;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getOrBuildDailyPlan(dayIdx, exerciseType, type) {
  const key = `${dayIdx}-${todayKey()}`;
  if (S.dailyExercisePlan[key]) return S.dailyExercisePlan[key];

  // Build full plan at max count
  const warmup = EXERCISES.filter(ex => ex.type === 'warmup').slice(0, 1);
  let main = [];

  if (exerciseType === 'calisthenics') {
    const pool = S.weeklyExercises.calisthenics.length > 0 ? S.weeklyExercises.calisthenics : BONUS_CALISTHENICS;
    main = selectRandomExercises(pool, MAX_EXERCISE_COUNT);
  } else if (exerciseType === 'cardio') {
    const pool = S.weeklyExercises.cardio.length > 0 ? S.weeklyExercises.cardio : EXERCISES.filter(ex => ex.type === 'cardio');
    main = pool.slice(0, MAX_EXERCISE_COUNT);
  } else {
    const poolMap = { push: S.weeklyExercises.push, pull: S.weeklyExercises.pull, legs: S.weeklyExercises.legs };
    const pool = poolMap[exerciseType] || [];
    main = selectRandomExercises(pool.length > 0 ? pool : EXERCISES.filter(ex => ex.type === exerciseType), MAX_EXERCISE_COUNT);
  }

  // Bonus pools — also fixed for the day
  const bonus = {
    abs:         selectRandomExercises(S.weeklyExercises.core.length > 0 ? S.weeklyExercises.core : [...BONUS_CORE, ...BONUS_CORE_ADVANCED], MAX_BONUS_COUNT),
    cardio:      selectRandomExercises([...BONUS_CARDIO_FINISHERS, ...BONUS_CARDIO_ADVANCED], MAX_BONUS_COUNT),
    glutes:      selectRandomExercises([...BONUS_GLUTES, ...BONUS_LEGS], MAX_BONUS_COUNT),
    calisthenics:selectRandomExercises(S.weeklyExercises.calisthenics.length > 0 ? S.weeklyExercises.calisthenics : BONUS_CALISTHENICS, MAX_BONUS_COUNT),
    legs:        selectRandomExercises(BONUS_LEGS, MAX_BONUS_COUNT),
    mobility:    selectRandomExercises(S.weeklyExercises.mobility.length > 0 ? S.weeklyExercises.mobility : BONUS_MOBILITY, MAX_BONUS_COUNT),
  };

  // Cooldown fixed for the day
  const cooldownMap = { push: S.weeklyExercises.cooldownPush, pull: S.weeklyExercises.cooldownPull, legs: S.weeklyExercises.cooldownLegs, cardio: S.weeklyExercises.cooldownCardio };
  const cooldownPool = cooldownMap[type] || [];
  const cooldown = cooldownPool.length > 0
    ? selectRandomExercises(cooldownPool, 1)
    : (() => { const sm = getSmartCooldown(type, main.flatMap(e => e.muscles || [])); return sm.slice(0, 1); })();

  const plan = { warmup, main, bonus, cooldown };
  S.dailyExercisePlan[key] = plan;

  // Prune old keys (keep only last 14 days)
  const allKeys = Object.keys(S.dailyExercisePlan);
  if (allKeys.length > 14) {
    allKeys.sort().slice(0, allKeys.length - 14).forEach(k => delete S.dailyExercisePlan[k]);
  }
  saveState();
  return plan;
}

function slicePlanByDuration(plan, workoutLength, workoutOptions, type) {
  const exerciseCount = { 15: 3, 30: 5, 45: 7, 60: 9, 90: 12 };
  const count = exerciseCount[workoutLength] || 7;
  const bonusCount = workoutLength >= 45 ? (workoutLength >= 60 ? 2 : 1) : 0;

  let exercises = [...plan.warmup, ...plan.main.slice(0, count)];

  if (bonusCount > 0) {
    if (workoutOptions.moreAbs)          exercises.push(...plan.bonus.abs.slice(0, bonusCount));
    if (workoutOptions.moreCardio && (type === 'push' || type === 'pull'))
                                         exercises.push(...plan.bonus.cardio.slice(0, bonusCount));
    if (workoutOptions.moreGlutes)       exercises.push(...plan.bonus.glutes.slice(0, bonusCount));
    if (workoutOptions.moreCalisthenics) exercises.push(...plan.bonus.calisthenics.slice(0, bonusCount));
    if (workoutOptions.moreLegs)         exercises.push(...plan.bonus.legs.slice(0, bonusCount));
    if (workoutOptions.moreMobility)     exercises.push(...plan.bonus.mobility.slice(0, bonusCount));
  }

  exercises.push(...plan.cooldown);
  return exercises;
}

function renderSchedule() {
  renderMergedHeader(); // ← Show recovery status in greeting
  const sched = getSched();
  const today = todayIdx();
  const todayType = sched[today];
  const typeLabel = { push: '💪 PUSH', pull: '⬇️ PULL', cardio: '🏃 CARDIO', rest: '😴 REST' };

  // Debug: Check if weekly exercises loaded
  console.log('🔍 Weekly exercises available:', {
    push: S.weeklyExercises.push?.length || 0,
    pull: S.weeklyExercises.pull?.length || 0,
    legs: S.weeklyExercises.legs?.length || 0,
    cardio: S.weeklyExercises.cardio?.length || 0
  });

  // Build recovery summary once
  const allMuscles = new Set();
  EXERCISES.forEach(ex =>
    ex.muscles.forEach(m => { if (m !== 'cardio' && m !== 'full body') allMuscles.add(m.toLowerCase()); })
  );

  const ready = [], caution = [], fatigued = [];
  allMuscles.forEach(muscle => {
    const r = getRecoveryStatus(muscle);
    if      (r.status === 'ready')    ready.push(muscle);
    else if (r.status === 'caution')  caution.push(`${muscle} (${Math.ceil(r.hoursUntilReady)}h)`);
    else                              fatigued.push(`${muscle} (${Math.ceil(r.hoursUntilReady)}h)`);
  });

  // Store recovery data globally for Charts page
  window.recoveryData = { ready, caution, fatigued, todayType };
  
  const typeEmoji = { push: '💪', pull: '⬇️', cardio: '🏃' };
  const dayCardsHtml = sched.map((type, idx) => {
    const showDay = _selectedDay !== null ? idx === _selectedDay : idx === todayIdx();
    if (!showDay) return '';
    if (type === 'rest') return '';
    
    // Override type if calisthenics day is enabled
    let exerciseType = S.calisthenicsDay[idx] ? 'calisthenics' : type;
    
  // Get one warmup, then main exercises
  let dayExercises = slicePlanByDuration(
    getOrBuildDailyPlan(idx, exerciseType, type),
    S.workoutLength,
    S.workoutOptions,
    type
  );
      const exHtml = dayExercises.map(ex => renderExerciseRow(ex)).join('');

    return `
  <div class="day-card expanded" data-day-index="${idx}" style="animation-delay:${idx * 50}ms">
    <div class="day-hdr" onclick="this.parentNode.classList.toggle('collapsed')" style="flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">${typeEmoji[type]}</span>
        <span class="day-name">${DAYS_SHORT[idx]} — ${S.calisthenicsDay[idx] ? 'CALISTHENICS' : type.toUpperCase()}</span>
        <button class="btn-secondary" onclick="event.stopPropagation(); toggleCalisthenicsDay(${idx})" style="white-space:nowrap;padding:4px 10px;font-size:12px">
          ${S.calisthenicsDay[idx] ? '🤸 Calisthenics' : '🏋️ Gym'}
        </button>
        <span class="chevron">⏷</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center" onclick="event.stopPropagation()">
        ${[15, 30, 45, 60].map(min => `
          <button class="duration-btn ${S.workoutLength === min ? 'active' : ''}" onclick="event.stopPropagation(); setWorkoutLength(${min})" style="padding:5px 0;font-size:11px;font-weight:600;background:var(--bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;flex:1;${S.workoutLength === min ? 'background:var(--brand);color:#fff;border-color:var(--brand)' : 'color:var(--text-secondary)'}">${min}m</button>
        `).join('')}
      </div>
    </div>
    <div class="day-body">${exHtml}</div>
  </div>`;
  }).join('');

  document.getElementById('schedule-days').innerHTML = dayCardsHtml;
}
function updateDayExercises(dayIndex) {
  const sched = getSched();
  const type = sched[dayIndex];
  if (type === 'rest') return;
  
  // Rebuild just this day's exercises
  let dayExercises = EXERCISES.filter(ex => ex.type === 'warmup').slice(0, 1);
  const exerciseCount = { 15: 3, 30: 5, 45: 7, 60: 9, 90: 12 };
  const count = exerciseCount[S.workoutLength] || 7;
  
  if (type === 'cardio') {
    dayExercises = dayExercises.concat(EXERCISES.filter(ex => ex.type === type).slice(0, 3));
  } else if (type === 'bodyweight') {
    dayExercises = dayExercises.concat(BODYWEIGHT_EXERCISES.slice(0, count));
  } else {
    dayExercises = dayExercises.concat(EXERCISES.filter(ex => ex.type === type).slice(0, count));
  }
  
  // Add bonuses (copy from renderSchedule lines 1641-1667)
  if (S.workoutOptions.moreAbs) {
    const cnt = getBonusExerciseCount();
    const absPool = [...BONUS_CORE, ...BONUS_CORE_ADVANCED];
    dayExercises.push(...selectRandomExercises(absPool, cnt));
  }
  if (S.workoutOptions.moreCardio && (type === 'push' || type === 'pull')) {
    const cnt = getBonusExerciseCount();
    const cardioPool = [...BONUS_CARDIO_FINISHERS, ...BONUS_CARDIO_ADVANCED];
    dayExercises.push(...selectRandomExercises(cardioPool, cnt));
  }
  if (S.workoutOptions.moreGlutes) {
    const cnt = getBonusExerciseCount();
    const glutePool = [...BONUS_GLUTES, ...BONUS_LEGS];
    dayExercises.push(...selectRandomExercises(glutePool, cnt));
  }
  if (S.workoutOptions.moreCalisthenics) {
    const cnt = getBonusExerciseCount();
    dayExercises.push(...selectRandomExercises(BONUS_CALISTHENICS, cnt));
  }
  if (S.workoutOptions.moreLegs) {
    const cnt = getBonusExerciseCount();
    dayExercises.push(...selectRandomExercises(BONUS_LEGS, cnt));
  }
  if (S.workoutOptions.moreMobility) {
    const cnt = getBonusExerciseCount();
    dayExercises.push(...selectRandomExercises(BONUS_MOBILITY, cnt));
  }
  
  // Add cooldown
  const dayMuscles = dayExercises.flatMap(ex => ex.muscles || []);
  const smartCooldowns = getSmartCooldown(type, dayMuscles);
  if (smartCooldowns.length > 0) _currentCooldown = smartCooldowns[0];
  dayExercises = dayExercises.concat(smartCooldowns);
  
  // Render just this day
  const exHtml = dayExercises.map(ex => renderExerciseRow(ex)).join('');
  const dayCard = document.querySelector(`[data-day-index="${dayIndex}"]`);
  if (dayCard) dayCard.querySelector('.day-body').innerHTML = exHtml;
}
function toggleCalisthenicsDay(dayIndex) {
  S.calisthenicsDay[dayIndex] = !S.calisthenicsDay[dayIndex];
  saveState();
  renderSchedule();
}

function selectRandomExercises(pool, count) {
  if (!pool || pool.length === 0) return [];
  if (count >= pool.length) return [...pool];
  
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  let result = shuffled.slice(0, count);
  
  // If we need more exercises than available, loop and shuffle again
  while (result.length < count) {
    const extra = [...pool].sort(() => Math.random() - 0.5);
    result = result.concat(extra.slice(0, count - result.length));
  }
  
  return result;
}
// Select random stretch from a category

function selectRandomStretch(stretches) {
  if (!stretches || stretches.length === 0) return null;
  return stretches[Math.floor(Math.random() * stretches.length)];
}
function getBonusExerciseCount() {
  const length = S.workoutLength;
  
  if (length <= 30) return 1;      // Short workouts: 1 bonus
  if (length <= 45) return 2;      // Medium: 2 bonuses
  if (length <= 60) return 3;      // Long: 3 bonuses
  if (length <= 75) return 4;      // Extra long: 4 bonuses
  return 5;                         // 90+ mins: 5 bonuses
}
function getSmartCooldown(workoutType, muscles = []) {
  let stretches = new Map();
  
  if (muscles.length > 0) {
    stretches = getStretchesForMuscles(muscles);
  } else {
    // Fallback to workout-type stretches
    const stretchMap = { 'push': STRETCHES_DATA.chest, 'pull': STRETCHES_DATA.back, 'cardio': STRETCHES_DATA.legs };
    const category = stretchMap[workoutType] || STRETCHES_DATA.shoulders;
    stretches.set('default', category);
  }
  
  const allStretches = Array.from(stretches.values()).flat();
  if (allStretches.length === 0) allStretches.push(STRETCHES_DATA.shoulders[0]);
  
  const count = Math.min(3, Math.max(1, Math.ceil(allStretches.length / 2)));
  const selected = selectRandomExercises(allStretches, count);
  
  return selected.map((s, idx) => ({
    id: `cooldown-${workoutType}-${idx}`,
    name: s.name,
    type: 'cooldown',
    emoji: '🧘',
    sets: '1',
    reps: s.duration,
    duration: 5,
    muscles: ['full-body'],
    desc: 'Cool down and recover.',
    steps: s.steps || [],
    wger_id: null,
    alts: []
  }));
}
function renderExerciseRow(ex) {
  const isLoggedToday = S.loggedToday && S.loggedToday.includes(ex.id);
  if (isLoggedToday) {
    // Get today's log entry for this exercise
    const today = new Date().toLocaleDateString('sv-SE');
    const logEntry = S.log.find(l => l.exId === ex.id && l.date === today);
    
    return `
      <div class="ex-row logged-exercise" onclick="event.stopPropagation(); this.classList.toggle('expanded-logged')">
        <div class="ex-thumb">${ex.emoji}</div>
        <div class="ex-info">
          <div class="ex-name">✅ ${ex.name}</div>
          <div class="ex-meta" style="display:none">Logged today</div>
          <div class="ex-btns" style="display:flex;gap:6px;margin-top:8px">
            <button class="ex-btn" onclick="event.stopPropagation(); showLogModal('${ex.id}', true)" style="background:var(--bg-secondary)">✏️ Edit</button>
            <button class="ex-btn" onclick="event.stopPropagation(); deleteLog('${ex.id}', '${today}')" style="background:var(--bg-secondary)">🗑️ Delete</button>
          </div>
        </div>
      </div>`;
  }
  // Check if this exercise has been swapped
const swap = S.sessionSwaps && S.sessionSwaps[ex.id];
if (swap) {
  // Show as swapped but keep original ex for display
  return `
    <div class="ex-row">
      <div class="ex-thumb">✅</div>
      <div class="ex-info">
        <div class="ex-name" style="color:var(--brand)">${swap.name}</div>
        <div style="font-size:11px;color:var(--brand);margin-top:2px">
          🔄 Swapped from: ${ex.name}
        </div>
        <div class="ex-btns">
          <button class="ex-btn" onclick="showLogModal('${ex.id}')">📝 Log</button>
          <button class="ex-btn" onclick="showSwapModal('${ex.id}')">🔄 Swap Again</button>
        </div>
      </div>
    </div>`;
}
  const conflicts = S.injuries.filter(inj =>
    (ex.muscles || []).map(m => m.toLowerCase()).includes(inj.muscle.toLowerCase())
  );
  const isUnsafe = conflicts.length > 0;

  // Skip injury check for warmup/cooldown — always safe
  if (isUnsafe && ex.type !== 'warmup' && ex.type !== 'cooldown') {
    const conflictList = conflicts.map(inj => `${inj.side} ${inj.muscle}`).join(', ');

    // Find the safest alt — prefer 'lower' intensity first, then 'same'
    const safestAlt = ex.alts
      ? ex.alts.find(a => a.int === 'lower') || ex.alts.find(a => a.int === 'same') || ex.alts[0]
      : null;

    return `
      <div class="ex-row" id="ex-row-${ex.id}">
        <div class="ex-thumb" style="opacity:0.4;filter:grayscale(1)">${ex.emoji}</div>
        <div class="ex-info">

          <!-- Unsafe banner -->
          <div style="
            background: var(--warn-light);
            border: 1.5px solid var(--warn);
            border-radius: var(--radius-md);
            padding: 10px 12px;
            margin-bottom: 8px;
          ">
            <div style="font-size:13px;font-weight:700;color:var(--warn);margin-bottom:4px">
              ⚠️ ${ex.name}
            </div>
            <div style="font-size:12px;color:var(--warn);margin-bottom:8px">
              Affects your <strong>${conflictList}</strong> injury
            </div>

            ${safestAlt ? `
              <!-- Suggested swap -->
              <div style="
                background: var(--bg);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 10px;
                margin-bottom: 8px;
              ">
                <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">
                  Suggested swap
                </div>
                <div style="font-size:14px;font-weight:600;color:var(--text)">${safestAlt.name}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
                  <span class="int-${safestAlt.int}">${safestAlt.int} intensity</span> · ${safestAlt.type}
                </div>
              </div>

              <div style="display:flex;gap:8px">
                <button class="btn-primary" 
                  onclick="swapToAlt('${ex.id}')" 
                  style="flex:1;font-size:12px;padding:7px">
                  ✅ Use This Instead
                </button>
                <button class="ex-btn" 
                  onclick="showSwapModal('${ex.id}')"
                  style="font-size:12px;padding:7px 10px">
                  🔄 See All Swaps
                </button>
              </div>
            ` : `
              <!-- No alts available -->
              <div style="font-size:12px;color:var(--warn)">
                No safe alternative available — consider skipping this exercise today.
              </div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <button class="ex-btn" onclick="showModal('${ex.id}')">ℹ️ Info</button>
              </div>
            `}
          </div>

        </div>
      </div>`;
  }

  // ── Safe exercise — normal render ──────────────────────
  return `
    <div class="ex-row">
      <div class="ex-thumb" onclick="showModal('${ex.id}')">${ex.emoji}</div>
      <div class="ex-info">
        <div class="ex-name">
          ${ex.name}
          ${isBonus(ex.id) ? ' ⭐' : ''}
        </div>
        <div class="ex-meta">${ex.sets} × ${ex.reps} • ⏱️ ${ex.duration || 5} min</div>
        <div class="ex-muscles">${ex.muscles.join(', ')}</div>
        <div class="ex-btns">
          <button class="ex-btn" onclick="showModal('${ex.id}')">ℹ️ Info</button>
          <button class="ex-btn" onclick="showLogModal('${ex.id}')">📝 Log</button>
          ${ex.alts && ex.alts.length
            ? `<button class="ex-btn" onclick="showSwapModal('${ex.id}')">🔄 Swap</button>`
            : ''}
        </div>
      </div>
    </div>`;
}
// ── BONUS STAR ──────────────────────────────────────────
function isBonus(exId) {
  const bonusIds = [...BONUS_CORE, ...BONUS_CARDIO_FINISHERS, ...BONUS_GLUTES, ...BONUS_CALISTHENICS, ...BONUS_CORE_ADVANCED, ...BONUS_CARDIO_ADVANCED, ...BONUS_LEGS, ...BONUS_MOBILITY].map(e => e.id);
  return bonusIds.includes(exId);
}
// ── WORKOUT LENGTH ──────────────────────────────────────────
function setWorkoutLength(mins) {
  S.workoutLength = parseInt(mins);
  saveState();
  renderSchedule();
}
// ── DAYS SELECTOR ──────────────────────────────────────────
function renderDaysSelector() {
  const html = DAYS_SHORT.map((day, i) =>
    `<button class="day-selector${S.customDays[i] ? ' active' : ''}" onclick="toggleDay(${i})">${day}</button>`
  ).join('');
  document.getElementById('days-row').innerHTML = html;
}

function toggleDay(idx) {
  S.customDays[idx] = !S.customDays[idx];
  if (!S.customDays.some(Boolean)) {
    S.customDays[idx] = true;
    alert('Select at least 1 day');
    return;
  }
  saveState();
  renderDaysSelector();
  renderWeekStrip();
  renderSchedule();
}

// ═══════════════════════════════════════════════════════════
// SECTION 5: INJURY & MUSCLE RECOVERY
// ═══════════════════════════════════════════════════════════

function showInjuryModal() {
  const muscleList = ['neck','shoulders','chest','back','lats','biceps','triceps','forearms','wrists','core','quads','hamstrings','glutes','knees','ankles','calves'];
  const sides = ['left','right','both'];

  const injListHtml = S.injuries.length
    ? S.injuries.map((inj, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:0.5px solid var(--border);border-radius:8px;margin-bottom:6px">
          <span><strong>${inj.side.charAt(0).toUpperCase() + inj.side.slice(1)}</strong> ${inj.muscle}</span>
          <button class="btn-danger" style="padding:4px 10px;font-size:11px" onclick="removeInjury(${i})">Remove</button>
        </div>`).join('')
    : '<p style="color:var(--text-secondary);font-size:13px">No injuries tracked — you\'re good to go! 🎉</p>';

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">🏥</span>
      <span class="modal-title">Manage Injuries</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Add injury:</label>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <select id="muscle-sel" class="form-select" style="flex:1">
          <option value="">Muscle...</option>
          ${muscleList.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
        <select id="side-sel" class="form-select" style="flex:0.8">
          ${sides.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <button class="btn-primary" onclick="addInjury()" style="width:100%;margin-bottom:1rem">Add</button>
      <div style="border-top:0.5px solid var(--border);padding-top:1rem">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px">Current injuries:</label>
        ${injListHtml}
      </div>
    </div>`;
  DOM.modal.style.display = 'flex';
}

function addInjury() {
  const muscle = document.getElementById('muscle-sel').value;
  const side   = document.getElementById('side-sel').value;
  if (!muscle) { alert('Select a muscle'); return; }
  if (S.injuries.find(i => i.muscle === muscle && i.side === side)) { alert('Already tracking this'); return; }
  S.injuries.push({ muscle, side, date: new Date().toISOString().split('T')[0] });
  saveState();
  showInjuryModal();
  renderMuscles();
  renderSchedule();
}

function removeInjury(idx) {
  S.injuries.splice(idx, 1);
  saveState();
  showInjuryModal();
  renderMuscles();
  renderSchedule();
}

// ── MUSCLE RECOVERY ────────────────────────────────────────
function getMuscleLastWorked(muscle) {
  const muscleLower = muscle.toLowerCase();
  let latest = null;
  for (const l of S.log) {
    const ex = getEX_MAP()[l.exId];
    if (ex && ex.muscles.some(m => m.toLowerCase() === muscleLower)) {
      if (!latest || l.date > latest) latest = l.date;
    }
  }
  return latest;
}

function getRecoveryStatus(muscle) {
  const lastWorked = getMuscleLastWorked(muscle);
  if (!lastWorked) return { status: 'ready', hoursUntilReady: 0, label: '✅ Ready' };

  const hoursSince = (Date.now() - new Date(lastWorked)) / 3_600_000;
  const hoursLeft  = Math.max(0, MUSCLE_RECOVERY_HOURS - hoursSince);

  if (hoursLeft <= 0)  return { status: 'ready',    hoursUntilReady: 0,        label: '✅ Ready' };
  if (hoursLeft <= 12) return { status: 'caution',  hoursUntilReady: hoursLeft, label: `⚠️ ${Math.ceil(hoursLeft)}h left` };
                       return { status: 'fatigued', hoursUntilReady: hoursLeft, label: `❌ ${Math.ceil(hoursLeft)}h left` };
}

function getStretchesForMuscles(muscles) {
  // Get targeted stretches for the muscles worked in this session
  const stretches = new Map();
  
  if (!muscles || muscles.length === 0) return stretches;
  
  muscles.forEach(muscle => {
    const cleanMuscle = muscle.toLowerCase().trim();
    if (STRETCHES_DATA[cleanMuscle]) {
      stretches.set(cleanMuscle, STRETCHES_DATA[cleanMuscle]);
    }
  });
  
  return stretches;
}

function showWorkoutStretches(exIds) {
  // Collect all muscles worked from the exercises
  const allMuscles = new Set();
  
  exIds.forEach(exId => {
    const ex = getEX_MAP()[exId];
    if (ex && ex.muscles) {
      ex.muscles.forEach(m => allMuscles.add(m));
    }
  });
  
  const stretches = getStretchesForMuscles(Array.from(allMuscles));
  const stretchHtml = Array.from(stretches.entries())
    .map(([muscle, stretchList]) => `
      <div style="margin-bottom: 1.5rem">
        <div style="font-weight: 600; text-transform: capitalize; color: var(--text); margin-bottom: 8px">
          ${muscle.toUpperCase()}
        </div>
        ${stretchList.map((stretch, idx) => `
          <div style="background: var(--bg-secondary); border: 0.5px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 8px">
            <div style="font-weight: 600; font-size: 13px; color: var(--text); margin-bottom: 4px">
              ${stretch.name}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px">
              ⏱️ ${stretch.duration}
            </div>
            <div style="font-size: 12px; line-height: 1.5">
              ${stretch.steps.map((step, i) => `<div style="margin-bottom: 4px">→ ${step}</div>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">🧘</span>
      <span class="modal-title">Post-Workout Stretches</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="max-height: 70vh; overflow-y: auto">
      <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 1rem; padding: 8px; background: var(--bg-secondary); border-radius: 6px">
        💡 Hold each stretch for the recommended time. Don't bounce — breathe and relax into it.
      </div>
      ${stretchHtml}
      <button class="btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 1rem">Done Stretching</button>
    </div>`;
  
  DOM.modal.style.display = 'flex';
}

// ── MUSCLES TAB ────────────────────────────────────────────
/* DISABLED: Muscle recovery tracking
function renderMuscles() {
  // FIX #3: Target #injury-warning correctly
  const injWarnEl = document.getElementById('injury-warning');
  if (S.injuries.length) {
    injWarnEl.innerHTML = `
      <div class="warn-box">
        <strong>🏥 Active injuries</strong><br>
        ${S.injuries.map(inj => `<strong>${inj.side.charAt(0).toUpperCase() + inj.side.slice(1)}</strong> ${inj.muscle} — since ${inj.date}`).join('<br>')}
        <br><button class="btn-secondary" onclick="showInjuryModal()" style="margin-top:8px;width:100%">Edit Injuries</button>
      </div>`;
  } else {
    injWarnEl.innerHTML = '';
  }

  const allMuscles = new Set();
  EXERCISES.forEach(ex =>
    ex.muscles.forEach(m => { if (m !== 'cardio' && m !== 'full body') allMuscles.add(m.toLowerCase()); })
  );

  const statusOrder = { fatigued: 0, caution: 1, ready: 2 };
  const statusColor = { ready: 'var(--brand)', caution: 'var(--warn)', fatigued: 'var(--danger)' };
  const statusBg    = { ready: 'rgba(29,158,117,0.08)', caution: 'rgba(186,117,23,0.08)', fatigued: 'rgba(211,47,47,0.08)' };

  const muscleRows = Array.from(allMuscles)
    .map(muscle => {
      const r = getRecoveryStatus(muscle);
      const logCount = S.log.filter(l => {
        const ex = getEX_MAP()[l.exId];
        return ex && ex.muscles.some(m => m.toLowerCase() === muscle);
      }).length;
      return { muscle, r, logCount, lastWorked: getMuscleLastWorked(muscle) || '—' };
    })
    .sort((a, b) => statusOrder[a.r.status] - statusOrder[b.r.status])
    .map(({ muscle, r, logCount, lastWorked }) => `
      <div style="padding:12px;display:flex;align-items:center;justify-content:space-between;border:0.5px solid var(--border);border-radius:8px;margin-bottom:6px;background:${statusBg[r.status]}">
        <div>
          <strong style="text-transform:capitalize;color:${statusColor[r.status]}">${muscle}</strong><br>
          <span style="font-size:11px;color:var(--text-tertiary)">Logged: ${logCount}x · Last: ${lastWorked}</span>
        </div>
        <span style="font-size:13px;font-weight:600;color:${statusColor[r.status]}">${r.label}</span>
      </div>`)
    .join('');

  document.getElementById('muscle-status').innerHTML =
    muscleRows || '<p style="color:var(--text-secondary);font-size:13px">Log workouts to see recovery tracking</p>';
}
*/

// ═══════════════════════════════════════════════════════════
// SECTION 4: LOGGING & STATS
// ═══════════════════════════════════════════════════════════

function showLogModal(exId, isEdit = false) {
  let ex = getEX_MAP()[exId];
  if (!ex && exId.startsWith('cooldown-')) ex = _currentCooldown;
  if (!ex) return;

  // Use swapped alt name if a swap is active
  const swap         = S.sessionSwaps && S.sessionSwaps[exId];
  const displayName  = swap ? swap.name : ex.name;
  const displayEmoji = swap ? '✅' : ex.emoji;

  const lastLog = S.log
    .filter(l => l.exId === exId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

// Different forms for warmup, cardio, and strength
  let fieldsHtml = '';
  
  if (ex.type === 'warmup' || ex.type === 'cooldown') {
    // Warmup/cooldown: auto-capture time spent
    const timeSpent = lastLog && lastLog.timeSpent ? lastLog.timeSpent : 5;
    fieldsHtml = `
      <div class="form-row">
        <span class="form-label">Time spent</span>
        <input type="number" id="log-time-spent" class="form-input"
          placeholder="5" step="1" value="${timeSpent}"
          inputmode="numeric">
        <span class="form-label" style="min-width:50px">minutes</span>
      </div>
      <div style="font-size:13px;color:var(--text-secondary);padding:12px;background:var(--bg-secondary);border-radius:6px;margin-bottom:12px">
        ✅ Time is auto-tracked. Adjust if needed.
      </div>
    `;
  } else if (ex.type === 'cardio') {
    // Cardio logging: Duration + Distance
    fieldsHtml = `
      <div class="form-row">
        <span class="form-label">Duration</span>
        <input type="number" id="log-duration" class="form-input"
          placeholder="30" step="1" value="${lastLog && lastLog.duration ? lastLog.duration : ''}"
          inputmode="numeric">
        <span class="form-label" style="min-width:50px">minutes</span>
      </div>
      <div class="form-row">
        <span class="form-label">Distance</span>
        <input type="number" id="log-distance" class="form-input"
          placeholder="5" step="0.1" value="${lastLog && lastLog.distance ? lastLog.distance : ''}"
          inputmode="decimal">
        <span class="form-label" style="min-width:50px">${S.unit === 'kg' ? 'km' : 'mi'}</span>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);padding:8px;background:var(--bg-secondary);border-radius:6px;margin-bottom:12px">
        💡 Duration is required. Distance is optional (estimate is fine).
      </div>
    `;
  } else {
    // Strength training: Weight + Reps + Sets + Auto-fill
    fieldsHtml = `
      <div class="form-row">
        <span class="form-label">Weight</span>
        <input type="number" id="log-weight" class="form-input"
          placeholder="0" step="0.5"
          value="${lastLog && lastLog.weight ? lastLog.weight : ''}"
          inputmode="decimal">
        <span class="form-label" style="min-width:30px">${S.unit}</span>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;margin-bottom:12px">
        Last: ${lastLog && lastLog.weight ? lastLog.weight + S.unit : 'No prior log'}
      </div>
      <div class="form-row">
        <span class="form-label">Reps</span>
        <input type="number" id="log-reps" class="form-input"
          placeholder="0" inputmode="numeric">
      </div>
      <div class="form-row">
        <span class="form-label">Sets</span>
        <input type="number" id="log-sets" class="form-input"
          placeholder="0" inputmode="numeric">
      </div>
    `;
  }

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">${displayEmoji}</span>
      <span class="modal-title">Log: ${displayName}</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      ${swap ? `
        <div style="font-size:12px;padding:8px;background:var(--brand-light);border-radius:6px;margin-bottom:12px;color:var(--brand)">
          🔄 Logging as swap for: <strong>${ex.name}</strong>
        </div>` : ''}
      ${fieldsHtml}
      <div class="form-row">
        <span class="form-label">How it felt</span>
        <select id="log-feel" class="form-select">
          <option value="">—</option>
          <option value="💪 Strong">💪 Strong</option>
          <option value="😐 OK">😐 OK</option>
          <option value="😵 Tired">😵 Tired</option>
          <option value="🤕 Sore">🤕 Sore</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-primary" onclick="logExercise('${exId}')" style="flex:1">
          Save Log
        </button>
        <button class="btn-secondary" onclick="showRestTimer()" style="white-space:nowrap">
          ⏱️ Rest
        </button>
      </div>
    </div>`;
  DOM.modal.style.display = 'flex';
}

// ── CALORIES & METRICS ─────────────────────────────────
function calculateBMR() {
  // Mifflin-St Jeor equation for Basal Metabolic Rate
  const { age, weight, height, gender } = S.profile;
  
  if (gender === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

function calculateCaloriesBurned(exId, weight, reps, sets, durationMinutes = null) {
  // Calculate calories burned for an exercise
  // Uses MET values (Metabolic Equivalent of Task)
  const ex = getEX_MAP()[exId];
  if (!ex) return 0;
  
  const bmr = calculateBMR();
  const tdee = bmr * 1.5; // Moderate activity multiplier
  const caloriesPerMinute = tdee / 1440; // Daily calories / minutes per day
  
  let durationMins = durationMinutes || (sets * (reps / 10) * 2); // Rough estimate: 2 min per 10 reps
  let metMultiplier = 1;
  
  // MET values by exercise type (intensity estimate)
  if (ex.type === 'cardio') {
    metMultiplier = 6; // Cardio burns ~6 METs
  } else if (weight > 50) {
    metMultiplier = 3.5; // Strength training with heavier weight
  } else {
    metMultiplier = 2.5; // Strength training lighter
  }
  
  const caloriesBurned = (caloriesPerMinute * metMultiplier * durationMins);
  return Math.round(caloriesBurned);
}

function logExercise(exId) {
  const ex = getEX_MAP()[exId];
  const date = new Date().toLocaleDateString('sv-SE');
  const feel = document.getElementById('log-feel').value;
  const swap = S.sessionSwaps && S.sessionSwaps[exId];
  const loggedName = swap ? `${swap.name} (swapped from ${ex.name})` : ex.name;
  
  // Handle warmup/cooldown first
  if (ex.type === 'warmup' || ex.type === 'cooldown') {
    const timeSpent = parseInt(document.getElementById('log-time-spent')?.value) || 5;
    const calories = Math.round(timeSpent * 5); // Rough estimate: 5 cal/min for warmup
    
    S.log.push({
      date, exId, exName: loggedName, feel,
      type: ex.type,
      timeSpent,
      calories
    });
    saveState();
    const today = new Date().toLocaleDateString('sv-SE');
    S.loggedToday = S.log.filter(l => l.date === today).map(l => l.exId);
    closeModal();
    const today_idx = todayIdx();
    updateDayExercises(today_idx);
    renderLog();
    renderMuscles();
    updateStats();
    alert(`✅ ${ex.name} logged! (${timeSpent}m → ${calories} cal)`);
    return;
  }
  
  let weight, reps, sets, distance, duration, calories;
  
  if (ex.type === 'cardio') {
        // Cardio: log time and distance
    duration = parseInt(document.getElementById('log-duration')?.value) || 0;
    distance = parseFloat(DOM.logDistance && DOM.logDistance.value) || 0;
    
    if (!duration) {
      alert('Please fill in duration (minutes)');
      return;
    }
    
    calories = calculateCaloriesBurned(exId, 0, 0, 0, duration);
    
    S.log.push({
      date, exId, exName: loggedName, feel,
      type: 'cardio',
      duration, distance, calories
    });
} else {
  // Strength training: log weight, reps, sets
  weight = parseFloat(document.getElementById('log-weight').value) || 0;
  reps = parseInt(document.getElementById('log-reps').value) || 0;
  sets = parseInt(document.getElementById('log-sets').value) || 0;
  
  if (!reps || !sets) {
    alert('Please fill in reps and sets');
    return;
  }    
    calories = calculateCaloriesBurned(exId, weight, reps, sets);
    
    S.log.push({
      date, exId, exName: loggedName, feel,
      type: 'strength',
      weight, reps, sets, calories
    });
  }
  
  S.progress.push({
    exId, date,
    ...(ex.type === 'cardio' ? { duration, distance, calories } : { weight, reps, sets, calories })
  });
  
  saveState();
  const today = new Date().toLocaleDateString('sv-SE');
  S.loggedToday = S.log.filter(l => l.date === today).map(l => l.exId);
  closeModal();
  const today_idx = todayIdx();
  updateDayExercises(today_idx);
  renderLog();
  renderMuscles();
  updateStats();
  alert(`✅ Logged! ${calories} calories burned`);
}

function renderLog() {
  const el = document.getElementById('log-entries');
  if (!S.log.length) {
    el.innerHTML = '<p style="color:var(--text-secondary);font-size:13px">No workouts logged yet.<br>Tap 📝 on any exercise to get started! 💪</p>';
    return;
  }

  // Get current filter from state (default to 'all')
  const currentFilter = window.logFilter || 'all';
  
  // Map exercise types to workout days
  const typeToDay = {
    push: 'push',
    pull: 'pull',
    legs: 'legs',
    cardio: 'cardio',
    warmup: 'warmup',
    cooldown: 'cooldown',
    strength: 'strength'
  };
  
  // Filter logs based on selected day
  let filteredLogs = S.log;
  if (currentFilter !== 'all') {
    filteredLogs = S.log.filter(l => typeToDay[l.type] === currentFilter);
  }
  
  // Group by date — most recent first
  const grouped = {};
  filteredLogs.forEach(l => { (grouped[l.date] = grouped[l.date] || []).push(l); });

  // Get today's exercises for stretch button
  const today = new Date().toLocaleDateString('sv-SE');
  const todayExercises = grouped[today] || [];
  const todayExIds = todayExercises.map(e => e.exId);
  
  const stretchButton = todayExIds.length > 0 ? `
    <button class="btn-primary" onclick="showWorkoutStretches(${JSON.stringify(todayExIds)})" style="width: 100%; margin-bottom: 1rem; font-size: 13px">
      🧘 Show Post-Workout Stretches for Today
    </button>
  ` : '';
  
  // Filter tabs
  const filterTabs = `
    <div style="display:flex;gap:8px;margin-bottom:1rem;overflow-x:auto;padding-bottom:8px">
      <button onclick="setLogFilter('all')" class="btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;${currentFilter === 'all' ? 'background:var(--brand);color:white' : ''}">All</button>
      <button onclick="setLogFilter('push')" class="btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;${currentFilter === 'push' ? 'background:var(--push);color:white' : ''}">💪 Push</button>
      <button onclick="setLogFilter('pull')" class="btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;${currentFilter === 'pull' ? 'background:var(--pull);color:white' : ''}">⬇️ Pull</button>
      <button onclick="setLogFilter('legs')" class="btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;${currentFilter === 'legs' ? 'background:var(--brand);color:white' : ''}">🦵 Legs</button>
      <button onclick="setLogFilter('cardio')" class="btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap;${currentFilter === 'cardio' ? 'background:var(--brand);color:white' : ''}">🏃 Cardio</button>
    </div>
  `;

  el.innerHTML = filterTabs + stretchButton + Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 50)
    .map(([date, entries]) => `
      <div style="margin-bottom:1rem">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">${date}</div>
        ${entries.map(e => {
          let details = '';
          let editBtn = `<button onclick="editLog('${e.exId}', '${e.date}')" style="font-size:11px;padding:4px 8px;background:var(--bg-secondary);border:none;border-radius:4px;cursor:pointer">Edit</button>`;
          
          if (e.type === 'warmup' || e.type === 'cooldown') {
            details = `${e.timeSpent || 5} min • 🔥 ${e.calories || 0} cal`;
          } else if (e.type === 'cardio') {
            details = `${e.duration} min${e.distance ? ` · ${e.distance}km` : ''} • 🔥 ${e.calories || 0} cal`;
          } else {
            details = `${e.sets} × ${e.reps} @ ${e.weight}${S.unit}${e.feel ? ' ' + e.feel : ''} • 🔥 ${e.calories || 0} cal`;
          }
          return `
            <div style="padding:10px;border:0.5px solid var(--border);border-radius:8px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between;align-items:start">
              <div style="flex:1">
                <strong>${e.exName}</strong><br>
                <span style="font-size:12px;color:var(--text-secondary)">${details}</span>
              </div>
              ${editBtn}
            </div>`;
        }).join('')}
      </div>`)
    .join('');
}

function setLogFilter(filter) {
  window.logFilter = filter;
  renderLog();
}

function editLog(exId, date) {
  // Find the log entry
  const logEntry = S.log.find(l => l.exId === exId && l.date === date);
  if (!logEntry) return;
  
  // Re-open log modal with edit mode
  showLogModal(exId, true);
}

function deleteLog(exId, date) {
  if (!confirm('Delete this log entry?')) return;
  
  // Remove from log
  S.log = S.log.filter(l => !(l.exId === exId && l.date === date));
  
  // Remove from progress if exists
  S.progress = S.progress.filter(p => !(p.exId === exId && p.date === date));
  
  // Update loggedToday
  const today = new Date().toLocaleDateString('sv-SE');
  S.loggedToday = S.log.filter(l => l.date === today).map(l => l.exId);
  
  saveState();
  const today_idx = todayIdx();
  updateDayExercises(today_idx);
  renderLog();
  renderMuscles();
  updateStats();
  alert('✅ Log entry deleted');
}
function totalMinutes(type) {
  if (type === 'rest') return 0;
  return S.workoutLength;
}
// ── BODY WEIGHT ────────────────────────────────────────────
function logBW() {
  const w = parseFloat(DOM.bwInput.value);
  if (!w || w <= 0) return;
  S.bwLog.push({ date: new Date().toLocaleDateString('sv-SE'), w });
  saveState();
  DOM.bwInput.value = '';
  renderBWHistory();
  updateStats();
}

function renderBWHistory() {
  const el = document.getElementById('bw-history');
  el.innerHTML = S.bwLog.length
    ? S.bwLog.slice(-7).reverse()
        .map(b => `<div class="bw-pill">${b.w}${S.unit} <span style="color:var(--text-tertiary)">${b.date}</span></div>`)
        .join('')
    : '<p style="color:var(--text-secondary);font-size:13px">No entries yet</p>';
}

// ── SETTINGS ───────────────────────────────────────────────
// FIX #4: Update BW label when unit changes
function setUnit(u) {
  S.unit = u;
  DOM.bwUnitLbl.textContent = u;
  saveState();
  renderLog();
  renderBWHistory();
  updateStats();
}

function updateStats() {
  const weekNum = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / 604_800_000);
  document.getElementById('stat-wk').textContent  = 'W' + (weekNum + 1);
  document.getElementById('stat-streak').textContent = getStreak() + '🔥';
  renderProgressPanel();
}

function getStreak() {
  if (!S.log.length) return 0;

  // Get all unique workout dates sorted descending
  const dates = [...new Set(S.log.map(l => l.date))]
    .sort((a, b) => b.localeCompare(a));

  if (!dates.length) return 0;

  const today     = new Date().toLocaleDateString('sv-SE');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('sv-SE');

  // Streak must include today or yesterday to be active
  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak  = 1;
  let current = new Date(dates[0]);

  for (let i = 1; i < dates.length; i++) {
    const prev    = new Date(dates[i]);
    const diffDay = Math.round((current - prev) / 86_400_000);

    if (diffDay === 1) {
      streak++;
      current = prev;
    } else {
      break;
    }
  }
  return streak;
}

function renderProgressPanel() {
  const progressPanel = document.getElementById('progress-panel');
  if (!progressPanel) return;
  
  // If no logged exercises, show empty state
  if (!S.log || S.log.length === 0) {
    progressPanel.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:1rem;">Log exercises first to see progress →</p>';
    return;
  }
  
  // Get unique exercises from log
  const exercises = [...new Set(S.log.map(l => l.ex))];
  if (exercises.length === 0) {
    progressPanel.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:1rem;">No exercises logged yet</p>';
    return;
  }
  
  let html = '<div style="display:flex;flex-direction:column;gap:1rem;">';
  
  exercises.slice(0, 5).forEach(exId => {
    const stats = getProgressStats(exId);
    if (!stats) return;
    
    const improvement = parseFloat(stats.improvement) || 0;
    const improvementColor = improvement > 0 ? 'var(--brand)' : 'var(--text-secondary)';
    const improvementSign = improvement > 0 ? '+' : '';
    
    html += `
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-md);padding:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
          <h4 style="margin:0;font-size:14px;font-weight:600;color:var(--brand);">${exId}</h4>
          <span style="font-size:11px;color:var(--text-tertiary);">${stats.total} logs</span>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:0.75rem;font-size:12px;">
          <div>
            <div style="color:var(--text-secondary);">Max</div>
            <div style="font-weight:600;color:var(--text);">${stats.maxWeight}${S.unit}</div>
          </div>
          <div>
            <div style="color:var(--text-secondary);">Avg</div>
            <div style="font-weight:600;color:var(--text);">${stats.avgWeight}${S.unit}</div>
          </div>
          <div>
            <div style="color:var(--text-secondary);">Gain</div>
            <div style="font-weight:600;color:${improvementColor};">${improvementSign}${stats.improvement}${S.unit}</div>
          </div>
        </div>
        
        <div style="font-size:11px;color:var(--text-tertiary);">
          ${stats.firstDate} → ${stats.lastDate}
        </div>
      </div>
    `;
  });
  
  if (exercises.length > 5) {
    html += `<p style="font-size:12px;color:var(--text-secondary);text-align:center;margin-top:0.5rem;">+${exercises.length - 5} more exercises</p>`;
  }
  
  html += '</div>';
  progressPanel.innerHTML = html;
}

/* DISABLED: Offline mode
function toggleOfflineMode() {
  S.offlineMode = !S.offlineMode;
  saveState();
  const btn = document.getElementById('offline-mode-btn');
  if (S.offlineMode) {
    btn.textContent = 'Force Offline: ON 🔴';
    btn.style.background = 'var(--brand)';
  } else {
    btn.textContent = 'Force Offline: OFF 🟢';
    btn.style.background = 'transparent';
  }
  console.log(S.offlineMode ? '🔴 Offline mode forced' : '🟢 Auto mode (connectivity-based)');
}
*/

function updateConnectivityStatus() {
  checkConnectivity();
  const statusEl = document.getElementById('connectivity-status');
  const source = getExerciseSource();
  
  if (statusEl) {
    if (S.offlineMode) {
      statusEl.textContent = '🔴 Offline Mode (Forced)';
      statusEl.style.color = '#ef4444';
    } else if (S.isOnline) {
      statusEl.textContent = '🟢 Online (Wger API)';
      statusEl.style.color = '#10b981';
    } else {
      statusEl.textContent = '🔴 Offline (No Connection)';
      statusEl.style.color = '#ef4444';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 6: EXERCISE SWAPS & MODALS
// ═══════════════════════════════════════════════════════════

function showModal(exId) {
  let ex = getEX_MAP()[exId];
  if (!ex && exId.startsWith('cooldown-')) ex = _currentCooldown;
  if (!ex) return;

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:22px">${ex.emoji}</span>
      <span class="modal-title">${ex.name}</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="gif-container" id="ex-image">${ex.emoji}</div>
      <p class="modal-desc">${ex.desc}</p>
      <div class="modal-steps-title">How to do it</div>
      <ol class="modal-steps">${ex.steps.map(s => `<li>${s}</li>`).join('')}</ol>
      <p style="font-size:12px;color:var(--text-tertiary);margin-top:0.75rem">🎯 Muscles: ${ex.muscles.join(', ')}</p>
      ${ex.alts && ex.alts.length ? `
        <div class="modal-alts">
          <div class="modal-alts-title">Alternatives</div>
          ${ex.alts.map(a => `
            <div class="alt-chip">
              <span class="alt-chip-name">${a.name}</span>
              <span class="alt-chip-meta"><span class="int-${a.int}">${a.int}</span> · ${a.type}</span>
            </div>`).join('')}
        </div>` : ''}
      <p class="api-credit" style="margin-top:1rem">Images via <a href="https://wger.de" target="_blank">wger.de</a></p>
    </div>`;
  
  DOM.modal.style.display = 'flex';
  
  // Try to load wger image if ID exists
  if (ex.wger_id) {
    loadWgerImage(ex.wger_id);
  }
}

async function loadWgerImage(wgerId) {
  try {
    const response = await fetch(`https://wger.de/api/v2/exerciseimage/?exercise=${wgerId}`);
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const imageContainer = document.getElementById('ex-image');
      if (imageContainer) {
        imageContainer.innerHTML = `<img src="${data.results[0].image}" alt="Exercise" style="width:100%;height:auto;border-radius:8px;max-height:300px;object-fit:cover;"/>`;
      }
    }
  } catch (e) {
    // Offline or error - emoji stays showing
  }
}

function showSwapModal(exId) {
  const ex = getEX_MAP()[exId];
  if (!ex || !ex.alts || !ex.alts.length) return;

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">🔄</span>
      <span class="modal-title">Swap: ${ex.name}</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:1rem">
        Pick an alternative that suits your equipment or how you feel today.
      </p>
      ${ex.alts.map((a, idx) => `
        <button onclick="selectAlt('${exId}', ${idx})" style="
          width:100%;
          padding:12px;
          margin-bottom:8px;
          background:var(--bg-secondary);
          border:1px solid var(--border);
          border-radius:var(--radius-md);
          cursor:pointer;
          text-align:left;
          transition:all 0.2s;
        " onmouseover="this.style.background='var(--brand-light)';this.style.borderColor='var(--brand)'" onmouseout="this.style.background='var(--bg-secondary)';this.style.borderColor='var(--border)'">
          <div style="font-weight:600;color:var(--text)">${a.name}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
            <span class="int-${a.int}">${a.int} intensity</span> · ${a.type}
          </div>
        </button>`).join('')}
    </div>`;
  DOM.modal.style.display = 'flex';
}
function selectAlt(exId, altIndex) {
  const ex = getEX_MAP()[exId];
  if (!ex || !ex.alts) return;
  
  const selectedAlt = ex.alts[altIndex];
  
  if (!S.sessionSwaps) S.sessionSwaps = {};
  S.sessionSwaps[exId] = selectedAlt;
  saveState();
  closeModal();
  renderSchedule();
}
// ── NEW: Confirm and apply the suggested swap ──────────────
function swapToAlt(exId) {
  const ex = getEX_MAP()[exId];
  if (!ex || !ex.alts || !ex.alts.length) return;

  const safestAlt = ex.alts.find(a => a.int === 'lower')
    || ex.alts.find(a => a.int === 'same')
    || ex.alts[0];

  // Show confirmation modal
  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">🔄</span>
      <span class="modal-title">Confirm Swap</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">

      <!-- From -->
      <div style="
        background: var(--danger-light);
        border-radius: var(--radius-md);
        padding: 12px;
        margin-bottom: 8px;
      ">
        <div style="font-size:11px;font-weight:600;color:var(--danger);margin-bottom:4px;text-transform:uppercase">
          Replacing
        </div>
        <div style="font-size:15px;font-weight:600">${ex.emoji} ${ex.name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${ex.muscles.join(', ')}</div>
      </div>

      <div style="text-align:center;font-size:20px;margin:4px 0">⬇️</div>

      <!-- To -->
      <div style="
        background: var(--brand-light);
        border-radius: var(--radius-md);
        padding: 12px;
        margin-bottom: 1.25rem;
      ">
        <div style="font-size:11px;font-weight:600;color:var(--brand);margin-bottom:4px;text-transform:uppercase">
          Swapping to
        </div>
        <div style="font-size:15px;font-weight:600">✅ ${safestAlt.name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
          <span class="int-${safestAlt.int}">${safestAlt.int} intensity</span> · ${safestAlt.type}
        </div>
      </div>

      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:1rem">
        💡 This swap is just for today's session. Your plan resets next visit.
      </p>

      <div style="display:flex;gap:8px">
        <button class="btn-primary" onclick="confirmSwap('${exId}')" style="flex:1">
          ✅ Confirm Swap
          saveState();
        </button>
        <button class="btn-secondary" onclick="showSwapModal('${exId}')" style="flex:1">
          🔄 See All Options
        </button>
      </div>
    </div>`;
  DOM.modal.style.display = 'flex';
}

// ── NEW: Apply the swap visually in the schedule ───────────
function confirmSwap(exId) {
  const ex = getEX_MAP()[exId];
  if (!ex || !ex.alts || !ex.alts.length) return;

  const safestAlt = ex.alts.find(a => a.int === 'lower')
    || ex.alts.find(a => a.int === 'same')
    || ex.alts[0];

  closeModal();

  if (!S.sessionSwaps) S.sessionSwaps = {};
  S.sessionSwaps[exId] = safestAlt;
  saveState();
  renderSchedule();
}
// ── REST TIMER ─────────────────────────────────────────────
// FIX #1: Restored missing function declaration

// ═══════════════════════════════════════════════════════════
// SECTION 9: TIMERS, NOTIFICATIONS & REMINDERS
// ═══════════════════════════════════════════════════════════

function showRestTimer() {
  const durations = [30, 60, 90, 120, 150, 180];
  const durationHtml = durations.map(d => {
    const mins = Math.floor(d / 60);
    const secs = d % 60;
    const label = mins > 0 ? `${mins}m${secs > 0 ? ` ${secs}s` : ''}` : `${secs}s`;
    return `<button class="btn-primary" onclick="startTimer(${d})" style="padding:8px">${label}</button>`;
  }).join('');

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">⏱️</span>
      <span class="modal-title">Rest Timer</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center">
      <div style="font-size:14px;color:var(--text-secondary);margin-bottom:1rem">Pick rest duration:</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:1rem">${durationHtml}</div>
      <div id="timer-display" style="display:none;font-size:48px;font-weight:600;color:var(--brand);margin:2rem 0;font-family:monospace"></div>
      <button class="btn-secondary" onclick="closeModal()" style="width:100%">Close</button>
    </div>`;
  DOM.modal.style.display = 'flex';
}

let _timerInterval = null;
let _currentCooldown = null;
let _weekOffset = 0;

function startTimer(seconds) {
  // Clear any existing timer
  if (_timerInterval) clearInterval(_timerInterval);

  let remaining = seconds;
  const display = DOM.timerDisplay;
  if (!display) return;
  display.style.display = 'block';
  display.style.color   = 'var(--brand)';

  if (navigator.vibrate) navigator.vibrate(100);

  const fmt = n => String(n).padStart(2, '0');
  display.textContent = `${fmt(Math.floor(remaining / 60))}:${fmt(remaining % 60)}`;

  _timerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(_timerInterval);
      _timerInterval = null;
      display.textContent = '✅ Done!';
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } catch (_) {}
      return;
    }
    display.textContent = `${fmt(Math.floor(remaining / 60))}:${fmt(remaining % 60)}`;
  }, 1000);
}

function closeModal() {
  DOM.modal.style.display = 'none';
  // Stop any running timer when modal closes
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}
function closeModalOut(e) { if (e.target.id === 'modal') closeModal(); }

// ═══════════════════════════════════════════════════════════
// SECTION 7: PAST WORKOUT LOGGING
// ═══════════════════════════════════════════════════════════

function showLogPastWorkoutModal() {
  const sched = getSched();
  const today = new Date();
  const typeEmoji = { push: '💪', pull: '⬇️', cardio: '🏃' };

  const dateOptions = [];
  for (let i = 1; i <= 14; i++) {
    const date    = new Date(today);
    date.setDate(date.getDate() - i);
    const dayIdx  = date.getDay() === 0 ? 6 : date.getDay() - 1;
    const dayType = sched[dayIdx];
    if (dayType !== 'rest') {
      dateOptions.push({
        dateStr: date.toLocaleDateString('sv-SE'),
        dayName: DAYS_SHORT[dayIdx],
        typeLabel: dayType.toUpperCase(),
        typeEmoji: typeEmoji[dayType],
        dayType
      });
    }
  }

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">↩️</span>
      <span class="modal-title">Log Past Workout</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:1rem">Pick the day you forgot to log:</div>
      ${dateOptions.map(opt => `
        <button class="btn-secondary" onclick="selectPastWorkoutDate('${opt.dateStr}','${opt.dayType}','${opt.dayName}')"
          style="width:100%;text-align:left;padding:10px 12px;margin-bottom:8px">
          <strong>${opt.dayName} ${opt.typeEmoji}</strong><br>
          <span style="font-size:11px;color:var(--text-secondary)">${opt.typeLabel} — ${opt.dateStr}</span>
        </button>`).join('')}
    </div>`;
  DOM.modal.style.display = 'flex';
}

function selectPastWorkoutDate(dateStr, dayType, dayName) {
  const dayExs = EXERCISES.filter(ex => ex.type === dayType);
  const typeEmoji  = { push: '💪', pull: '⬇️', cardio: '🏃' };

  DOM.modalBody.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span style="font-size:20px">${typeEmoji[dayType]}</span>
      <span class="modal-title">${dayName} ${dayType.toUpperCase()}</span>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;padding:8px;background:var(--brand-light);border-radius:6px">
        📅 <strong>${dateStr}</strong> — Fill in what you did
      </div>
      ${dayExs.map(ex => `
        <div style="background:var(--bg-secondary);border:0.5px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-weight:600;font-size:13px;margin-bottom:8px">${ex.emoji} ${ex.name}</div>
          <div style="display:flex;gap:4px">
  <div style="flex:1;min-width:0">
    <label style="font-size:11px;color:var(--text-secondary)">Weight (${S.unit})</label>
    <input type="number" class="form-input" placeholder="0" step="0.5" id="pw-weight-${ex.id}" inputmode="decimal" style="font-size:12px;padding:6px 4px;min-width:0;width:100%">
      </div>
        <div style="flex:1;min-width:0">
          <label style="font-size:11px;color:var(--text-secondary)">Reps</label>
          <input type="number" class="form-input" placeholder="0" id="pw-reps-${ex.id}" inputmode="numeric" style="font-size:12px;padding:6px 4px;min-width:0;width:100%">
        </div>
          <div style="flex:1;min-width:0">
            <label style="font-size:11px;color:var(--text-secondary)">Sets</label>
            <input type="number" class="form-input" placeholder="0" id="pw-sets-${ex.id}" inputmode="numeric" style="font-size:12px;padding:6px 4px;min-width:0;width:100%">
          </div>
        </div>
      </div>`).join('')}
      <div style="display:flex;gap:8px">
        <button class="btn-primary" onclick="savePastWorkout('${dateStr}','${dayType}')" style="flex:1">Save Workout</button>
        <button class="btn-secondary" onclick="showLogPastWorkoutModal()" style="flex:1">Back</button>
      </div>
    </div>`;
  DOM.modal.style.display = 'flex';
}

function savePastWorkout(dateStr, dayType) {
  const dayExs = EXERCISES.filter(ex => ex.type === dayType);

  let savedCount = 0;

  dayExs.forEach(ex => {
    const weight = parseFloat(document.getElementById(`pw-weight-${ex.id}`)?.value) || 0;
    const reps   = parseInt(document.getElementById(`pw-reps-${ex.id}`)?.value)   || 0;
    const sets   = parseInt(document.getElementById(`pw-sets-${ex.id}`)?.value)   || 0;

    if (weight > 0 && reps > 0 && sets > 0) {
      S.log.push({ date: dateStr, exId: ex.id, exName: ex.name, weight, reps, sets, feel: '' });
      S.progress.push({ exId: ex.id, date: dateStr, weight, reps, sets });
      savedCount++;
    }
  });

  if (savedCount === 0) { alert('Fill in at least one exercise to save'); return; }

  saveState();
  closeModal();
  renderLog();
  renderMuscles();
  updateStats();
  alert(`✅ Logged ${savedCount} exercise${savedCount > 1 ? 's' : ''} for ${dateStr}`);
}

/* DISABLED: Notifications
// ── NOTIFICATIONS ──────────────────────────────────────────
function reqNotif() {
  if (!('Notification' in window)) { alert('Notifications not supported in this browser.'); return; }
  Notification.requestPermission().then(p => {
    if (p === 'granted') {
      S.notifEnabled = true;
      localStorage.setItem('gym_notif', 'true');
      DOM.notifBar.style.display = 'flex';
      DOM.notifBtn.textContent = 'Enabled ✓';
      scheduleNextReminder();
    } else {
      alert('Permission denied — enable notifications in your browser settings.');
    }
  });
}

function scheduleNextReminder() {
  const sched  = getSched();
  const tmrIdx = (todayIdx() + 1) % 7;
  const tmrType = sched[tmrIdx];
  if (tmrType === 'rest') return;

  const now    = new Date();
  const target = new Date(now);
  target.setHours(20, 0, 0, 0);

  const delay = target - now;
  if (delay > 0) {
    setTimeout(() => {
      new Notification('💪 Gym tomorrow!', {
        body: `${DAYS_SHORT[tmrIdx]} is a ${tmrType.toUpperCase()} day — pack your bag! 🎒`,
        icon: '/icons/icon-192.png'
      });
    }, delay);
  }
}
*/

// ═══════════════════════════════════════════════════════════
// SECTION 11: EXPORT, UTILITIES & INITIALIZATION
// ═══════════════════════════════════════════════════════════

function exportLog() {
  if (!S.log.length && !S.bwLog.length) {
    alert('Nothing to export yet — log some workouts first! 💪');
    return;
  }

  const lines = ['WORKOUT LOG', `Exported: ${new Date().toLocaleDateString('sv-SE')}`, ''];

  if (S.bwLog.length) {
    lines.push('=== BODY WEIGHT ===');
    S.bwLog.forEach(b => lines.push(`${b.date}: ${b.w} ${S.unit}`));
    lines.push('');
  }

  if (S.log.length) {
    lines.push('=== WORKOUT LOG ===');
    const grouped = {};
    S.log.forEach(l => { (grouped[l.date] = grouped[l.date] || []).push(l); });
    Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .forEach(([date, entries]) => {
        lines.push(`\n--- ${date} ---`);
        entries.forEach(e =>
          lines.push(`  ${e.exName}: ${e.sets} × ${e.reps} @ ${e.weight} ${S.unit}  ${e.feel || ''}`)
        );
      });
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a    = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(blob),
    download: `gym-log-${new Date().toLocaleDateString('sv-SE')}.txt`
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function clearLog() {
  if (!confirm('Clear ALL workout and body weight logs? This cannot be undone.')) return;
  S.log = []; S.bwLog = []; S.progress = [];
  localStorage.removeItem('gym_log');
  localStorage.removeItem('gym_bw');
  localStorage.removeItem('gym_progress');
  renderLog();
  renderBWHistory();
  renderMuscles();
  updateStats();
}

// ═══════════════════════════════════════════════════════════
// SECTION 10: INSTALLATION & UI NAVIGATION
// ═══════════════════════════════════════════════════════════

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    DOM.installPrompt.innerHTML = `
      <div class="install-banner">
        <div>📲</div>
        <div class="install-text">
          <strong>Install as app</strong>
          Add to your Home Screen for the full offline experience
        </div>
        <button class="btn-primary" onclick="promptInstall()" style="white-space:nowrap">Install</button>
      </div>`;
  });

  window.addEventListener('appinstalled', () => {
    DOM.installPrompt.innerHTML = '';
    deferredInstallPrompt = null;
  });
}

function promptInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
  } else {
    alert('📱 To install on iPhone:\n\n1. Tap Share (box with arrow) in Safari\n2. Scroll down → "Add to Home Screen"\n3. Tap "Add" 🎉');
  }
}

// ── NAVIGATION ─────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + name).classList.add('active');

  // Render charts when tab opens
  // Small delay lets the tab become visible first
  // so canvas can measure its width correctly
  if (name === 'charts') setTimeout(renderChartsTab, 50);
}

// ── SERVICE WORKER ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/gym/sw.js').catch(() => {});
}

// ============================================================
// CHARTS & PROGRESS
// ============================================================

// ═══════════════════════════════════════════════════════════
// SECTION 8: CHARTS & PROGRESS
// ═══════════════════════════════════════════════════════════

function populateChartSelector() {
  const sel = DOM.chartExSelect;
  if (!sel) return;

  // Only show exercises that have been logged
  const loggedIds = [...new Set(S.log.map(l => l.exId))];
  const loggedExs = loggedIds
    .map(id => getEX_MAP()[id])
    .filter(Boolean)
    .filter(ex => ex.type !== 'warmup' && ex.type !== 'cooldown');

  sel.innerHTML = '<option value="">Select exercise...</option>' +
    loggedExs.map(ex =>
      `<option value="${ex.id}">${ex.emoji} ${ex.name}</option>`
    ).join('');
}

// ── RENDER CHARTS TAB ──────────────────────────────────────
function renderChartsTab() {
  updateChartStats();
  updateStats();
  // renderMergedHeader(); // ← TEMPORARILY DISABLED FOR TESTING
  populateChartSelector();
  renderBWChart();
  renderFreqChart();

  // Auto-select first logged exercise
  const sel = DOM.chartExSelect;
  if (sel && sel.options.length > 1) {
    sel.selectedIndex = 1;
    renderProgressChart();
  }
}

function renderMergedHeader() {
  try {
    const data = window.recoveryData || { ready: [], caution: [], fatigued: [], todayType: 'rest' };
    const { fatigued, caution } = data;
    
    let recoveryEmoji = '🟢', recoveryText = 'Ready';
    if (fatigued.length > 0) {
      recoveryEmoji = '🔴';
      recoveryText = 'Fatigued';
    } else if (caution.length > 0) {
      recoveryEmoji = '⚠️';
      recoveryText = 'Caution';
    }
    
    const greetingEl = document.getElementById('greeting');
    if (!greetingEl) return;
    
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const streakMsg = getStreak() > 0 ? `🔥 ${getStreak()} day streak!` : '';
    const greetingText = `${greeting}, ${S.userName}! 💪${streakMsg ? '  ' + streakMsg : ''}`;
    
    greetingEl.innerHTML = `
      <div style="line-height:1.4">
        <div>${greetingText}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">Recovery status: ${recoveryText} ${recoveryEmoji}</div>
      </div>
    `;
  } catch (e) {
    console.error('❌ renderMergedHeader error:', e);
  }
}

// ── CHART STATS ────────────────────────────────────────────
function updateChartStats() {
  const uniqueDates = [...new Set(S.log.map(l => l.date))];
  const totalVolume = S.log.reduce((sum, l) => sum + (l.weight * l.reps * l.sets), 0);
  const uniqueExs   = [...new Set(S.log.map(l => l.exId))].length;
  const bestStreak  = getBestStreak();

  document.getElementById('chart-stat-workouts').textContent  = uniqueDates.length;
  document.getElementById('chart-stat-streak').textContent    = bestStreak + '🔥';
  document.getElementById('chart-stat-volume').textContent    =
    totalVolume >= 1000
      ? (totalVolume / 1000).toFixed(1) + 'k'
      : Math.round(totalVolume);
  document.getElementById('chart-stat-exercises').textContent = uniqueExs;
}

function getBestStreak() {
  if (!S.log.length) return 0;
  const dates = [...new Set(S.log.map(l => l.date))]
    .sort((a, b) => a.localeCompare(b));

  let best = 1, current = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round(
      (new Date(dates[i]) - new Date(dates[i - 1])) / 86_400_000
    );
    if (diff === 1) { current++; best = Math.max(best, current); }
    else current = 1;
  }
  return best;
}

// ── PROGRESS CHART (weight over time per exercise) ─────────
function renderProgressChart() {
  const exId = DOM.chartExSelect.value;
  const card  = document.getElementById('chart-card');

  if (!exId) { card.style.display = 'none'; return; }

  const ex = getEX_MAP()[exId];
  if (!ex) return;

  // Get logs for this exercise sorted by date
  const logs = S.log
    .filter(l => l.exId === exId && l.weight > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!logs.length) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  document.getElementById('chart-title').textContent = `${ex.emoji} ${ex.name}`;

  // Find PR
  const maxWeight = Math.max(...logs.map(l => l.weight));
  const prEntry   = logs.find(l => l.weight === maxWeight);

  // Build stats row
  const firstLog = logs[0];
  const lastLog  = logs[logs.length - 1];
  const improvement = lastLog.weight - firstLog.weight;

  document.getElementById('chart-stats-row').innerHTML = `
    <div class="pr-badge">🏆 PR: ${maxWeight}${S.unit} on ${prEntry.date}</div>
    ${improvement > 0
      ? `<div class="bw-pill">📈 +${improvement}${S.unit} since first log</div>`
      : improvement < 0
        ? `<div class="bw-pill" style="background:var(--danger-light);color:var(--danger)">📉 ${improvement}${S.unit}</div>`
        : `<div class="bw-pill">➡️ Consistent</div>`
    }
    <div class="bw-pill">${logs.length} sessions logged</div>
  `;

  const canvas = document.getElementById('progress-chart');
  drawLineChart(canvas, {
    labels:   logs.map(l => l.date.slice(5)),  // MM-DD
    values:   logs.map(l => l.weight),
    color:    getComputedStyle(document.documentElement)
                .getPropertyValue('--brand').trim() || '#1D9E75',
    unit:     S.unit,
    prValue:  maxWeight
  });
}

// ── BODY WEIGHT CHART ──────────────────────────────────────
function renderBWChart() {
  const canvas  = document.getElementById('bw-chart');
  const emptyEl = document.getElementById('bw-chart-empty');

  if (!S.bwLog.length) {
    canvas.style.display  = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  canvas.style.display  = 'block';
  emptyEl.style.display = 'none';

  const sorted = [...S.bwLog]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20); // last 20 entries

  drawLineChart(canvas, {
    labels: sorted.map(b => b.date.slice(5)),
    values: sorted.map(b => b.w),
    color:  '#378ADD',
    unit:   S.unit
  });
}

// ── FREQUENCY CHART (workouts per week) ───────────────────
function renderFreqChart() {
  const canvas  = document.getElementById('freq-chart');
  const emptyEl = document.getElementById('freq-chart-empty');

  if (!S.log.length) {
    canvas.style.display  = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  canvas.style.display  = 'block';
  emptyEl.style.display = 'none';

  // Build last 8 weeks
  const weeks = [];
  const now   = new Date();

  for (let w = 7; w >= 0; w--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (w * 7) - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const count = [...new Set(
      S.log
        .filter(l => {
          const d = new Date(l.date);
          return d >= weekStart && d <= weekEnd;
        })
        .map(l => l.date)
    )].length;

    const label = `W${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    weeks.push({ label, count });
  }

  drawBarChart(canvas, {
    labels: weeks.map(w => w.label),
    values: weeks.map(w => w.count),
    color:  '#D85A30',
    unit:   'days'
  });
}

// ── CORE CHART DRAWING — Line Chart ───────────────────────
function drawLineChart(canvas, { labels, values, color, unit, prValue }) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W    = rect.width  || canvas.offsetWidth  || 300;
  const H    = rect.height || canvas.offsetHeight || 220;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (!values.length) return;

  const PAD    = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  const minVal = Math.min(...values) * 0.95;
  const maxVal = Math.max(...values) * 1.05;
  const range  = maxVal - minVal || 1;

  const xStep  = chartW / Math.max(values.length - 1, 1);

  const toX = i => PAD.left + i * xStep;
  const toY = v => PAD.top + chartH - ((v - minVal) / range) * chartH;

  // ── Grid lines ─────────────────────────────────────────
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#999' : '#888';

  ctx.strokeStyle = gridColor;
  ctx.lineWidth   = 1;

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y   = PAD.top + (chartH / gridLines) * i;
    const val = maxVal - (range / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();

    ctx.fillStyle  = textColor;
    ctx.font       = `${10 * dpr / dpr}px -apple-system, sans-serif`;
    ctx.textAlign  = 'right';
    ctx.fillText(val.toFixed(1), PAD.left - 6, y + 3);
  }

  // ── Gradient fill ──────────────────────────────────────
  const grad = ctx.createLinearGradient(0, PAD.top, 0, H - PAD.bottom);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '00');

  ctx.beginPath();
  values.forEach((v, i) => {
    i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
  });
  ctx.lineTo(toX(values.length - 1), H - PAD.bottom);
  ctx.lineTo(toX(0), H - PAD.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Line ───────────────────────────────────────────────
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  values.forEach((v, i) => {
    i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v));
  });
  ctx.stroke();

  // ── Data points ────────────────────────────────────────
  values.forEach((v, i) => {
    const x  = toX(i);
    const y  = toY(v);
    const pr = prValue && v === prValue;

    ctx.beginPath();
    ctx.arc(x, y, pr ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = pr ? '#FFD700' : color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();
  });

  // ── X axis labels ──────────────────────────────────────
  ctx.fillStyle = textColor;
  ctx.font      = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';

  const maxLabels = Math.floor(chartW / 40);
  const step      = Math.max(1, Math.ceil(labels.length / maxLabels));

  labels.forEach((lbl, i) => {
    if (i % step === 0 || i === labels.length - 1) {
      ctx.fillText(lbl, toX(i), H - PAD.bottom + 16);
    }
  });
}

// ── CORE CHART DRAWING — Bar Chart ────────────────────────
function drawBarChart(canvas, { labels, values, color, unit }) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W    = rect.width  || canvas.offsetWidth  || 300;
  const H    = rect.height || canvas.offsetHeight || 160;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const PAD    = { top: 16, right: 16, bottom: 36, left: 30 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  const maxVal    = Math.max(...values, 1);
  const barWidth  = (chartW / values.length) * 0.6;
  const barGap    = chartW / values.length;

  const isDark    = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const textColor = isDark ? '#999' : '#888';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  // ── Grid ───────────────────────────────────────────────
  ctx.strokeStyle = gridColor;
  ctx.lineWidth   = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach(p => {
    const y = PAD.top + chartH * (1 - p);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
    if (p > 0) {
      ctx.fillStyle = textColor;
      ctx.font      = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * p), PAD.left - 4, y + 3);
    }
  });

  // ── Bars ───────────────────────────────────────────────
  values.forEach((v, i) => {
    const x      = PAD.left + i * barGap + (barGap - barWidth) / 2;
    const barH   = (v / maxVal) * chartH;
    const y      = PAD.top + chartH - barH;
    const radius = Math.min(4, barWidth / 2);

    ctx.fillStyle = v > 0 ? color : gridColor;

    // Rounded top corners
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + barWidth - radius, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
    ctx.lineTo(x + barWidth, y + barH);
    ctx.lineTo(x, y + barH);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    // Value on top of bar
    if (v > 0) {
      ctx.fillStyle = textColor;
      ctx.font      = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(v, x + barWidth / 2, y - 4);
    }

    // X label
    ctx.fillStyle = textColor;
    ctx.font      = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barWidth / 2, H - PAD.bottom + 14);
  });
}
// ── AUTH MODAL FUNCTIONS ──────────────────────────────────────
function showAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return; // HTML not ready yet
  modal.style.display = 'flex';
  document.getElementById('auth-tab-login').click();
}

function hideAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
  
  if (tab === 'login') {
    document.getElementById('auth-tab-login').classList.add('active');
    document.getElementById('auth-form-login').style.display = 'block';
  } else {
    document.getElementById('auth-tab-register').classList.add('active');
    document.getElementById('auth-form-register').style.display = 'block';
  }
}

function handleLogin() {
  const username = document.getElementById('auth-login-user').value.trim();
  const password = document.getElementById('auth-login-pass').value;
  
  if (!username || !password) {
    alert('Please fill all fields');
    return;
  }
  
  const result = loginUser(username, password);
  if (!result.ok) {
    alert(result.msg);
    return;
  }
  
  S.userName = username;
  hideAuthModal();
  location.reload();
}

function handleRegister() {
  const username = document.getElementById('auth-register-user').value.trim();
  const password = document.getElementById('auth-register-pass').value;
  const pass2 = document.getElementById('auth-register-pass2').value;
  
  if (!username || !password || !pass2) {
    alert('Please fill all fields');
    return;
  }
  
  if (password !== pass2) {
    alert('Passwords do not match');
    return;
  }
  
  if (password.length < 4) {
    alert('Password min 4 chars');
    return;
  }
  
  const result = registerUser(username, password);
  if (!result.ok) {
    alert(result.msg);
    return;
  }
  
  const login = loginUser(username, password);
  if (login.ok) {
    S.userName = username;
    hideAuthModal();
    location.reload();
  }
}

/* DISABLED: Onboarding tutorial
// ── ONBOARDING FUNCTIONS ──────────────────────────────────────
let currentOnboardingSlide = 0;

function showOnboarding() {
  const modal = document.getElementById('onboarding-modal');
  modal.style.display = 'flex';
  currentOnboardingSlide = 0;
  renderOnboardingSlide();
}

function hideOnboarding() {
  const modal = document.getElementById('onboarding-modal');
  modal.style.display = 'none';
  S.hasSeenOnboarding = true;
  saveState();
}

function renderOnboardingSlide() {
  const slide = ONBOARDING_SLIDES[currentOnboardingSlide];
  const emoji = slide.title.split(' ')[slide.title.split(' ').length - 1];
  
  document.getElementById('onboarding-emoji').textContent = emoji;
  document.getElementById('onboarding-title').textContent = slide.title.replace(/ [^\s]+$/, '').trim();
  document.getElementById('onboarding-subtitle').textContent = slide.subtitle;
  document.getElementById('onboarding-text').textContent = slide.content;
  document.getElementById('onboarding-counter').textContent = `${currentOnboardingSlide + 1} / ${ONBOARDING_SLIDES.length}`;
  
  // Target the Back button specifically in the onboarding modal
  const modalButtons = document.querySelector('#onboarding-modal').querySelectorAll('button');
  const backBtn = modalButtons[1]; // Second button is Back
  backBtn.style.display = currentOnboardingSlide === 0 ? 'none' : 'block';
}

function onboardingAction(action) {
  if (action === 'skip') {
    hideOnboarding();
  } else if (action === 'back' && currentOnboardingSlide > 0) {
    currentOnboardingSlide--;
    renderOnboardingSlide();
  } else if (action === 'next') {
    if (currentOnboardingSlide < ONBOARDING_SLIDES.length - 1) {
      currentOnboardingSlide++;
      renderOnboardingSlide();
    } else {
      hideOnboarding();
    }
  }
}
*/

// ── START ──────────────────────────────────────────────────
init();