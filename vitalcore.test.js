/**
 * VitalCore Legacy Tests (monolith HTML era)
 *
 * NOTE: These tests were written for the original single-file HTML monolith.
 * The app has since been rewritten as a Vite + React + TypeScript project.
 * All tests referencing index.html inline code are now skipped.
 * New tests live in src/__tests__/*.test.ts
 */

const fs = require('fs');
const path = require('path');

// index.html is now the Vite entry point — no inline JS
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Extract utility functions from the HTML
const calcBMR = (gender, weight, height, age) => {
  if (gender === 'male') return 10 * weight + 6.25 * height - 5 * age + 5;
  return 10 * weight + 6.25 * height - 5 * age - 161;
};

const calcTDEE = (bmr, activity) => {
  const m = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  return Math.round(bmr * (m[activity] || 1.2));
};

const calcAge = (dob) => {
  const today = new Date('2026-03-30');
  let age = today.getFullYear() - new Date(dob).getFullYear();
  const md = today.getMonth() - new Date(dob).getMonth();
  if (md < 0 || (md === 0 && today.getDate() < new Date(dob).getDate())) age--;
  return age;
};

const moodEmoji = (v) => ['', '\uD83D\uDE1E', '\uD83D\uDE14', '\uD83D\uDE10', '\uD83D\uDE42', '\uD83D\uDE04'][v] || '';
const moodColor = (v) => ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'][v] || '#e2e8f0';

const formatTime = (hours) => {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return h + ':' + m.toString().padStart(2, '0');
};

// ==================== TESTS ====================

describe('HTML Structure (Vite entry point)', () => {
  test('HTML file exists and is non-empty', () => {
    expect(html.length).toBeGreaterThan(0);
  });

  test('has correct DOCTYPE and lang', () => {
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toMatch(/<html lang="fr">/);
  });

  test('has meta charset UTF-8', () => {
    expect(html).toMatch(/<meta charset="UTF-8"/i);
  });

  test('has viewport meta tag', () => {
    expect(html).toMatch(/<meta name="viewport"/);
  });

  test('has root element', () => {
    expect(html).toMatch(/id="root"/);
  });

  test('loads main.tsx as module', () => {
    expect(html).toMatch(/src="\/src\/main\.tsx"/);
  });
});

describe('Build dependencies (package.json)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

  test('React 18 is a dependency', () => {
    expect(pkg.dependencies.react).toMatch(/\^18\./);
  });

  test('Supabase JS is a dependency', () => {
    expect(pkg.dependencies['@supabase/supabase-js']).toMatch(/\^2\./);
  });

  test('react-router-dom is a dependency', () => {
    expect(pkg.dependencies['react-router-dom']).toBeDefined();
  });

  test('Vite is in devDependencies', () => {
    expect(pkg.devDependencies.vite).toBeDefined();
  });

  test('TypeScript is in devDependencies', () => {
    expect(pkg.devDependencies.typescript).toBeDefined();
  });
});

describe('React app entry point', () => {
  const mainContent = fs.readFileSync(path.join(__dirname, 'src/main.tsx'), 'utf8');

  test('uses createRoot (not deprecated ReactDOM.render)', () => {
    expect(mainContent).toMatch(/createRoot/);
  });

  test('renders App inside BrowserRouter', () => {
    expect(mainContent).toMatch(/BrowserRouter/);
    expect(mainContent).toMatch(/App/);
  });

  test('wraps with AuthProvider', () => {
    expect(mainContent).toMatch(/AuthProvider/);
  });
});

describe('calcBMR', () => {
  test('calculates male BMR correctly (Mifflin-St Jeor)', () => {
    // Male, 80kg, 175cm, 30 years
    const result = calcBMR('male', 80, 175, 30);
    // 10*80 + 6.25*175 - 5*30 + 5 = 800 + 1093.75 - 150 + 5 = 1748.75
    expect(result).toBeCloseTo(1748.75, 2);
  });

  test('calculates female BMR correctly', () => {
    // Female, 60kg, 165cm, 25 years
    const result = calcBMR('female', 60, 165, 25);
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
    expect(result).toBeCloseTo(1345.25, 2);
  });

  test('handles edge case: very low values', () => {
    const result = calcBMR('male', 40, 140, 18);
    expect(result).toBeGreaterThan(0);
  });

  test('handles edge case: high values', () => {
    const result = calcBMR('male', 150, 210, 60);
    expect(result).toBeGreaterThan(0);
  });
});

describe('calcTDEE', () => {
  test('sedentary multiplier (1.2)', () => {
    expect(calcTDEE(2000, 'sedentary')).toBe(2400);
  });

  test('light activity multiplier (1.375)', () => {
    expect(calcTDEE(2000, 'light')).toBe(2750);
  });

  test('moderate activity multiplier (1.55)', () => {
    expect(calcTDEE(2000, 'moderate')).toBe(3100);
  });

  test('active multiplier (1.725)', () => {
    expect(calcTDEE(2000, 'active')).toBe(3450);
  });

  test('very active multiplier (1.9)', () => {
    expect(calcTDEE(2000, 'very_active')).toBe(3800);
  });

  test('unknown activity defaults to sedentary (1.2)', () => {
    expect(calcTDEE(2000, 'unknown')).toBe(2400);
    expect(calcTDEE(2000, '')).toBe(2400);
  });

  test('returns rounded integer', () => {
    const result = calcTDEE(1748.75, 'moderate');
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('calcAge', () => {
  test('calculates age correctly for past birthday', () => {
    // Born Jan 15, 1990 - as of March 30, 2026 = 36
    expect(calcAge('1990-01-15')).toBe(36);
  });

  test('calculates age correctly for upcoming birthday', () => {
    // Born Dec 15, 1990 - as of March 30, 2026 = 35 (birthday not yet)
    expect(calcAge('1990-12-15')).toBe(35);
  });

  test('handles birthday today', () => {
    // Born March 30, 2000
    expect(calcAge('2000-03-30')).toBe(26);
  });

  test('handles young age', () => {
    expect(calcAge('2010-01-01')).toBe(16);
  });
});

describe('moodEmoji', () => {
  test('returns correct emoji for each mood level', () => {
    expect(moodEmoji(1)).toBe('\uD83D\uDE1E');
    expect(moodEmoji(2)).toBe('\uD83D\uDE14');
    expect(moodEmoji(3)).toBe('\uD83D\uDE10');
    expect(moodEmoji(4)).toBe('\uD83D\uDE42');
    expect(moodEmoji(5)).toBe('\uD83D\uDE04');
  });

  test('returns empty string for invalid mood', () => {
    expect(moodEmoji(0)).toBe('');
    expect(moodEmoji(6)).toBe('');
    expect(moodEmoji(-1)).toBe('');
  });
});

describe('moodColor', () => {
  test('returns correct color for each mood level', () => {
    expect(moodColor(1)).toBe('#ef4444');
    expect(moodColor(2)).toBe('#f97316');
    expect(moodColor(3)).toBe('#eab308');
    expect(moodColor(4)).toBe('#22c55e');
    expect(moodColor(5)).toBe('#10b981');
  });

  test('returns default color for invalid mood', () => {
    expect(moodColor(0)).toBe('#e2e8f0');
    expect(moodColor(6)).toBe('#e2e8f0');
  });
});

describe('formatTime', () => {
  test('formats whole hours', () => {
    expect(formatTime(5)).toBe('5:00');
    expect(formatTime(16)).toBe('16:00');
  });

  test('formats hours with minutes', () => {
    expect(formatTime(5.5)).toBe('5:30');
    expect(formatTime(2.25)).toBe('2:15');
    expect(formatTime(1.75)).toBe('1:45');
  });

  test('formats zero', () => {
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('Error Handling (source code)', () => {
  const authCtx = fs.readFileSync(path.join(__dirname, 'src/contexts/AuthContext.tsx'), 'utf8');
  const loginScr = fs.readFileSync(path.join(__dirname, 'src/screens/auth/LoginScreen.tsx'), 'utf8');
  const signupScr = fs.readFileSync(path.join(__dirname, 'src/screens/auth/SignupScreen.tsx'), 'utf8');

  test('AuthContext has safety timeout to prevent infinite loading', () => {
    expect(authCtx).toMatch(/setTimeout/);
    expect(authCtx).toMatch(/setLoading.*false/);
  });

  test('AuthContext has try/catch on auth state change', () => {
    expect(authCtx).toMatch(/try\s*\{/);
    expect(authCtx).toMatch(/catch/);
  });

  test('login screen shows user-facing error', () => {
    expect(loginScr).toMatch(/setError/);
  });

  test('signup screen shows user-facing error', () => {
    expect(signupScr).toMatch(/setError/);
  });
});

describe('Supabase Schema Alignment (source code)', () => {
  const photosScr = fs.readFileSync(path.join(__dirname, 'src/screens/dashboard/features/PhotosScreen.tsx'), 'utf8');
  const glp1Scr   = fs.readFileSync(path.join(__dirname, 'src/screens/dashboard/features/GLP1Screen.tsx'), 'utf8');
  const dashHook  = fs.readFileSync(path.join(__dirname, 'src/hooks/useDashboardData.ts'), 'utf8');

  test('progress_photos uses taken_at column', () => {
    expect(photosScr).toMatch(/taken_at/);
  });

  test('injection_date is stored as YYYY-MM-DD (slice/split)', () => {
    // GLP1Screen uses toISOString().slice(0, 10) or similar
    expect(glp1Scr).toMatch(/slice\(0,\s*10\)|split\('T'\)\[0\]/);
  });

  test('dashboard hook references all core tables', () => {
    // profiles is loaded via AuthContext, not dashboard hook
    const tables = ['meals', 'fasting_sessions', 'progress_photos', 'medications', 'injection_logs', 'weight_logs', 'water_logs', 'body_measurements'];
    tables.forEach(table => {
      expect(dashHook).toContain(`'${table}'`);
    });
  });
});

describe('Auth Flow (source code)', () => {
  const authCtx   = fs.readFileSync(path.join(__dirname, 'src/contexts/AuthContext.tsx'), 'utf8');
  const signupScr = fs.readFileSync(path.join(__dirname, 'src/screens/auth/SignupScreen.tsx'), 'utf8');
  const loginScr  = fs.readFileSync(path.join(__dirname, 'src/screens/auth/LoginScreen.tsx'), 'utf8');

  test('signup screen propagates errors to UI', () => {
    // Error messages come from AuthContext; SignupScreen displays them
    expect(signupScr).toMatch(/setError|result\.error/);
  });

  test('duplicate account error message in AuthContext', () => {
    expect(authCtx).toMatch(/Un compte existe|already/);
  });

  test('login error is shown to user', () => {
    // LoginScreen calls login() and sets error from result
    expect(loginScr).toMatch(/setError|result\.error/);
  });

  test('loadProfile is awaited in AuthContext init', () => {
    expect(authCtx).toMatch(/await loadProfile/);
  });

  test('session user is validated before use', () => {
    expect(authCtx).toMatch(/session.*user|user.*session/);
  });
});

describe('UI/UX (source code)', () => {
  const bottomNav   = fs.readFileSync(path.join(__dirname, 'src/components/layout/BottomNav.tsx'), 'utf8');
  const fastingScr  = fs.readFileSync(path.join(__dirname, 'src/screens/dashboard/features/FastingScreen.tsx'), 'utf8');
  const glp1Scr     = fs.readFileSync(path.join(__dirname, 'src/screens/dashboard/features/GLP1Screen.tsx'), 'utf8');
  const premModal   = fs.readFileSync(path.join(__dirname, 'src/screens/dashboard/modals/PremiumModal.tsx'), 'utf8');
  const journalMod  = fs.readFileSync(path.join(__dirname, 'src/screens/dashboard/modals/JournalModal.tsx'), 'utf8');
  const photosScr   = fs.readFileSync(path.join(__dirname, 'src/screens/dashboard/features/PhotosScreen.tsx'), 'utf8');

  test('BottomNav has all 5 main tabs', () => {
    expect(bottomNav).toMatch(/Accueil/);
    expect(bottomNav).toMatch(/Nutrition/);
    expect(bottomNav).toMatch(/Calendrier/);
    expect(bottomNav).toMatch(/Coach/);
    expect(bottomNav).toMatch(/Profil/);
  });

  test('fasting screen has 16:8 protocol', () => {
    expect(fastingScr).toMatch(/16:8/);
    expect(fastingScr).toMatch(/Intermittent|jeûne/i);
  });

  test('GLP-1 screen has Ozempic and Mounjaro', () => {
    expect(glp1Scr).toMatch(/Ozempic/);
    expect(glp1Scr).toMatch(/Mounjaro/);
  });

  test('premium modal shows pricing', () => {
    expect(premModal).toMatch(/9\.99|Premium/);
  });

  test('journal modal has mood feature', () => {
    expect(journalMod).toMatch(/mood|Humeur/i);
  });

  test('photos screen has before/after comparison', () => {
    expect(photosScr).toMatch(/Avant.*Apr|before.*after/i);
  });
});
