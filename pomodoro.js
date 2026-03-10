/* ============================================================
   POMODORO TIMER – Student Toolkit
   JavaScript Logic
   ============================================================ */

// ── Mode settings (seconds) ──────────────────────────────────
const MODES = {
  pomodoro: { label: 'Focus Session', duration: 25 * 60 },
  short: { label: 'Short Break ☕', duration: 5 * 60 },
  long: { label: 'Long Break 🌙', duration: 15 * 60 },
};

// ── State ────────────────────────────────────────────────────
let currentMode = 'pomodoro';
let totalSeconds = MODES.pomodoro.duration;
let remainingSeconds = totalSeconds;
let isRunning = false;
let intervalId = null;
let sessionsDone = 0;
let bestStreak = 0;
let currentStreak = 0;

// hourly bucket – last 8 hours
let hourlyData = {};
let heatmapCells = 30; // number of cells in the heatmap strip
let heatmapData = []; // 0–4 per cell
for (let i = 0; i < heatmapCells; i++) heatmapData.push(0);

// ── DOM refs ─────────────────────────────────────────────────
const timerDisplay = document.getElementById('timer-display');
const timerStatus = document.getElementById('timer-status');
const sessionLabel = document.getElementById('session-label');
const ringProgress = document.getElementById('ring-progress');
const btnPlay = document.getElementById('btn-play');
const btnReset = document.getElementById('btn-reset');
const btnSkip = document.getElementById('btn-skip');
const iconPlay = btnPlay.querySelector('.icon-play');
const iconPause = btnPlay.querySelector('.icon-pause');
const sessionDots = document.getElementById('session-dots');
const sessionsCount = document.getElementById('sessions-count');
const statSessions = document.getElementById('stat-sessions');
const statMinutes = document.getElementById('stat-minutes');
const statStreak = document.getElementById('stat-streak');
const graphBars = document.getElementById('graph-bars');
const heatmapEl = document.getElementById('heatmap');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const toastIcon = document.getElementById('toast-icon');
const btnClear = document.getElementById('btn-clear');

// SVG ring constants
const RING_CIRCUMFERENCE = 2 * Math.PI * 95; // ≈ 596.9
ringProgress.setAttribute('stroke-dasharray', RING_CIRCUMFERENCE);

// Inject SVG gradient
const svgEl = document.querySelector('.ring-svg');
const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
defs.innerHTML = `
  <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%"   stop-color="#E6C96A"/>
    <stop offset="100%" stop-color="#A07830"/>
  </linearGradient>`;
svgEl.prepend(defs);
ringProgress.setAttribute('stroke', 'url(#ringGradient)');

// ── Bell Sound (Web Audio API) ────────────────────────────────
function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const times = [0, 0.35, 0.7, 1.05];
    times.forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + offset);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + offset + 0.6);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.9);

      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 1.0);
    });
  } catch (e) {
    console.warn('Audio play failed:', e);
  }
}

// ── Utilities ─────────────────────────────────────────────────
function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function updateRing() {
  const fraction = remainingSeconds / totalSeconds;
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  ringProgress.setAttribute('stroke-dashoffset', offset);
}

function updateDisplay() {
  timerDisplay.textContent = formatTime(remainingSeconds);
  document.title = `${formatTime(remainingSeconds)} – Study Timer`;
  updateRing();
}

// ── Play/Pause ────────────────────────────────────────────────
function startTimer() {
  isRunning = true;
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  btnPlay.classList.add('running');
  timerStatus.textContent = currentMode === 'pomodoro' ? 'Focusing...' : 'On a break...';

  intervalId = setInterval(() => {
    remainingSeconds--;
    updateDisplay();
    if (remainingSeconds <= 0) {
      clearInterval(intervalId);
      onTimerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  clearInterval(intervalId);
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  btnPlay.classList.remove('running');
  timerStatus.textContent = 'Paused';
}

function resetTimer() {
  pauseTimer();
  remainingSeconds = totalSeconds;
  timerStatus.textContent = 'Ready to focus';
  updateDisplay();
}

function skipTimer() {
  pauseTimer();
  onTimerComplete(true);
}

// ── Timer complete ────────────────────────────────────────────
function onTimerComplete(skipped = false) {
  isRunning = false;
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  btnPlay.classList.remove('running');

  if (currentMode === 'pomodoro' && !skipped) {
    sessionsDone++;
    currentStreak++;
    if (currentStreak > bestStreak) bestStreak = currentStreak;
    recordSession();
    updateStats();
    showToast('🎉', 'Great work! Take a break.');
    playBell();

    // Browser notification
    if (Notification.permission === 'granted') {
      new Notification('Pomodoro Done! 🍅', { body: 'Time for a break. Great work!' });
    }
  } else if (currentMode !== 'pomodoro' && !skipped) {
    showToast('⏰', 'Break over! Back to work.');
    playBell();
    currentStreak = 0;
  }

  // Auto-advance suggestion
  remainingSeconds = totalSeconds;
  timerStatus.textContent = 'Session complete!';
  updateDisplay();
  renderDots();
}

// ── Mode switching ────────────────────────────────────────────
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector('.mode-tab.active').classList.remove('active');
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    const mode = MODES[currentMode];
    totalSeconds = mode.duration;
    resetTimer();
    sessionLabel.textContent = mode.label;
  });
});

// ── Button listeners ──────────────────────────────────────────
btnPlay.addEventListener('click', () => {
  if (isRunning) pauseTimer(); else startTimer();
});
btnReset.addEventListener('click', resetTimer);
btnSkip.addEventListener('click', skipTimer);
btnClear.addEventListener('click', () => {
  sessionsDone = 0; currentStreak = 0; bestStreak = 0;
  hourlyData = {};
  heatmapData = heatmapData.map(() => 0);
  updateStats();
  renderGraph();
  renderHeatmap();
  renderDots();
});

// ── Session dots ──────────────────────────────────────────────
function renderDots() {
  sessionsCount.textContent = sessionsDone;
  sessionDots.innerHTML = '';
  const show = Math.min(sessionsDone, 8);
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < show ? ' filled' : '');
    sessionDots.appendChild(d);
  }
}
renderDots();

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  statSessions.textContent = sessionsDone;
  statMinutes.textContent = sessionsDone * 25;
  statStreak.textContent = bestStreak;
}

// ── Graph data ────────────────────────────────────────────────
function recordSession() {
  const now = new Date();
  const hour = now.getHours();
  hourlyData[hour] = (hourlyData[hour] || 0) + 1;

  // heatmap – shift if full, else add at front
  heatmapData.push(Math.min(heatmapData[heatmapData.length - 1] + 1, 4));
  if (heatmapData.length > heatmapCells) heatmapData.shift();

  renderGraph();
  renderHeatmap();
}

// ── Bar graph ─────────────────────────────────────────────────
function renderGraph() {
  graphBars.innerHTML = '';
  const now = new Date();
  const maxVal = 4;

  for (let i = 7; i >= 0; i--) {
    const hour = (now.getHours() - i + 24) % 24;
    const count = hourlyData[hour] || 0;
    const heightPct = (count / maxVal) * 100;

    const group = document.createElement('div');
    group.className = 'bar-group';

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${heightPct}%`;
    bar.setAttribute('data-count', count);
    bar.title = `${hour}:00 – ${count} session${count !== 1 ? 's' : ''}`;

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = formatHour(hour);

    group.appendChild(bar);
    group.appendChild(label);
    graphBars.appendChild(group);
  }
}

function formatHour(h) {
  const period = h >= 12 ? 'pm' : 'am';
  const d = h % 12 || 12;
  return `${d}${period}`;
}

// ── Heatmap ───────────────────────────────────────────────────
function renderHeatmap() {
  heatmapEl.innerHTML = '';
  heatmapData.forEach(v => {
    const cell = document.createElement('div');
    cell.className = 'heat-cell' + (v > 0 ? ` h${Math.min(v, 4)}` : '');
    heatmapEl.appendChild(cell);
  });
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimeout;
function showToast(icon, msg) {
  clearTimeout(toastTimeout);
  toastIcon.textContent = icon;
  toastMsg.textContent = msg;
  toast.classList.add('show');
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ── Notification permission ───────────────────────────────────
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ── Initial render ────────────────────────────────────────────
updateDisplay();
renderGraph();
renderHeatmap();


/* ═══════════════════════════════════════════════════════════════
   CUSTOM REMINDERS
   ═══════════════════════════════════════════════════════════════ */

// ── DOM refs ──────────────────────────────────────────────────
const reminderTextInput = document.getElementById('reminder-text');
const reminderMinsInput = document.getElementById('reminder-mins');
const btnAddReminder = document.getElementById('btn-add-reminder');
const reminderList = document.getElementById('reminder-list');
const reminderEmpty = document.getElementById('reminder-empty');

// ── Reminder store ────────────────────────────────────────────
// Each entry: { id, text, secondsLeft, intervalId, li }
let reminders = [];
let reminderIdCounter = 0;

// ── Add reminder ──────────────────────────────────────────────
function addReminder() {
  const text = reminderTextInput.value.trim();
  const mins = parseInt(reminderMinsInput.value, 10);

  if (!text) {
    reminderTextInput.focus();
    reminderTextInput.style.borderColor = 'rgba(255,100,100,0.7)';
    setTimeout(() => reminderTextInput.style.borderColor = '', 1200);
    return;
  }
  if (!mins || mins < 1 || mins > 120) {
    reminderMinsInput.focus();
    reminderMinsInput.parentElement.style.borderColor = 'rgba(255,100,100,0.7)';
    setTimeout(() => reminderMinsInput.parentElement.style.borderColor = '', 1200);
    return;
  }

  const id = ++reminderIdCounter;
  const secondsLeft = mins * 60;

  // Build the list item
  const li = document.createElement('li');
  li.className = 'reminder-item';
  li.dataset.id = id;

  li.innerHTML = `
    <span class="reminder-bell">🔔</span>
    <span class="reminder-text-label">${escapeHtml(text)}</span>
    <span class="reminder-countdown" id="rc-${id}">${formatTime(secondsLeft)}</span>
    <button class="reminder-delete-btn" title="Remove" data-id="${id}">✕</button>
  `;

  // Hide empty state, append item
  reminderEmpty.style.display = 'none';
  reminderList.appendChild(li);

  // Start countdown
  const reminder = { id, text, secondsLeft, li };
  reminder.intervalId = setInterval(() => tickReminder(reminder), 1000);
  reminders.push(reminder);

  // Clear inputs
  reminderTextInput.value = '';
  reminderMinsInput.value = '';
  reminderTextInput.focus();
}

// ── Tick one reminder ─────────────────────────────────────────
function tickReminder(reminder) {
  reminder.secondsLeft--;
  const badge = document.getElementById(`rc-${reminder.id}`);

  if (reminder.secondsLeft <= 0) {
    // Fire!
    clearInterval(reminder.intervalId);
    triggerReminder(reminder);
    removeReminderFromList(reminder.id);
    return;
  }

  if (badge) {
    badge.textContent = formatTime(reminder.secondsLeft);
    // Urgent style in last 60 seconds
    if (reminder.secondsLeft <= 60) {
      badge.classList.add('urgent');
    }
  }
}

// ── Fire reminder ─────────────────────────────────────────────
function triggerReminder(reminder) {
  playBell();
  showToast('⏰', reminder.text);

  if (Notification.permission === 'granted') {
    new Notification('Reminder ⏰', { body: reminder.text });
  }
}

// ── Remove from DOM & array ───────────────────────────────────
function removeReminderFromList(id) {
  const idx = reminders.findIndex(r => r.id === id);
  if (idx !== -1) {
    clearInterval(reminders[idx].intervalId);
    reminders[idx].li.style.opacity = '0';
    reminders[idx].li.style.transform = 'scale(0.95)';
    reminders[idx].li.style.transition = '0.3s ease';
    setTimeout(() => {
      reminders[idx].li.remove();
      reminders.splice(idx, 1);
      if (reminders.length === 0) reminderEmpty.style.display = '';
    }, 300);
  }
}

// ── Escape HTML to prevent XSS ───────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event listeners ───────────────────────────────────────────
btnAddReminder.addEventListener('click', addReminder);

// Allow Enter key in the text input to add reminder
reminderTextInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addReminder();
});

// Delete button (event delegation on the list)
reminderList.addEventListener('click', e => {
  const btn = e.target.closest('.reminder-delete-btn');
  if (btn) removeReminderFromList(Number(btn.dataset.id));
});
