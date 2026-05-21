const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DB = './data.json';
const INTERVALS = [1, 3, 5, 7, 14, 30];
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'recall@resend.dev';

// ── timetable extracted from your photo ──────────────────────────────────────
// Week A and B, each day lists which subjects you have
// Format: { weekA: { mon: [...], tue: [...], ... }, weekB: { ... } }
const TIMETABLE = {
  A: {
    mon: ['Math', 'English', 'History/HSIE', 'Technology'],
    tue: ['Math', 'English', 'Visual Arts', 'PDH'],
    wed: ['History/HSIE', 'English', 'Technology', 'Science', 'Math', 'PDH'],
    thu: ['History/HSIE', 'English', 'Science', 'PDH', 'Science'],
    fri: ['History/HSIE', 'Visual Arts', 'Technology', 'Math', 'Science'],
  },
  B: {
    mon: ['Visual Arts', 'English', 'History/HSIE', 'Math'],
    tue: ['Technology', 'PDH', 'English', 'Math', 'Drama'],
    wed: ['Technology', 'History/HSIE', 'Math', 'English'],
    thu: ['Science', 'PDH', 'English', 'Science'],
    fri: ['History/HSIE', 'Technology', 'Science', 'Math'],
  }
};

// Only subjects user cares about for recall
const RECALL_SUBJECTS = ['Math', 'English', 'Science', 'History/HSIE'];

// ── DB helpers ────────────────────────────────────────────────────────────────
function load() {
  if (!fs.existsSync(DB)) return { users: {}, currentWeek: 'A', weekStartDate: todayStr() };
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch { return { users: {}, currentWeek: 'A', weekStartDate: todayStr() }; }
}
function save(db) { fs.writeFileSync(DB, JSON.stringify(db, null, 2)); }

function todayStr() { return new Date().toISOString().split('T')[0]; }
function addDays(s, n) {
  const d = new Date(s + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function getDayName() {
  return ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()];
}

// Figure out if it's week A or B
function getCurrentWeek(db) {
  // Toggle week every Monday
  const start = new Date(db.weekStartDate + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.floor((now - start) / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  return diffWeeks % 2 === 0 ? db.currentWeek : (db.currentWeek === 'A' ? 'B' : 'A');
}

function getTodaysSubjects(db) {
  const week = getCurrentWeek(db);
  const day = getDayName();
  if (day === 'sat' || day === 'sun') return [];
  const subjects = (TIMETABLE[week][day] || []);
  return [...new Set(subjects.filter(s => RECALL_SUBJECTS.includes(s)))];
}

// ── Email via Resend ──────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend error');
  return data;
}

function buildEmail(email, dueTopics, todaysSubjects) {
  const COLORS = { Math:'#0369a1', English:'#9d174d', 'History/HSIE':'#7c3aed', Science:'#065f46', Technology:'#b45309', default:'#555' };

  const reviewRows = dueTopics.length ? dueTopics.map(t => {
    const c = COLORS[t.subject] || COLORS.default;
    const revNum = (t.completedReviews || []).length + 1;
    const next = t.reviewDates.find(d => d > todayStr());
    return `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #eee;vertical-align:top">
        <span style="display:inline-block;background:${c}18;color:${c};font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;margin-bottom:4px">${t.subject}</span><br>
        <strong style="font-size:15px;color:#1a1714">${t.name}</strong>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #eee;color:#888;font-size:13px;text-align:center;vertical-align:top">
        Review #${revNum}<br>
        <span style="font-size:11px">${next ? 'Next: '+next : '🎓 Last one!'}</span>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="2" style="padding:20px;text-align:center;color:#aaa">Nothing due for review today!</td></tr>`;

  const todaySection = todaysSubjects.length ? `
    <div style="background:#f5f2eb;border-radius:8px;padding:14px 16px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#8a8478;text-transform:uppercase;letter-spacing:0.08em">You had these classes today</p>
      <p style="margin:0;font-size:14px;color:#1a1714">${todaysSubjects.join(' · ')}</p>
      <p style="margin:6px 0 0;font-size:11px;color:#aaa">These have been added to your recall schedule automatically.</p>
    </div>` : '';

  return `
    <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#1a1714;padding:24px 28px">
        <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:-0.02em">recall. 📚</h1>
        <p style="color:#888;margin:6px 0 0;font-size:13px">Your 5pm study reminder · ${new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}</p>
      </div>
      <div style="padding:24px 28px">
        ${todaySection}
        <p style="font-size:11px;font-weight:600;color:#8a8478;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px">Due for active recall</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
          ${reviewRows}
        </table>
        <p style="font-size:11px;color:#bbb;margin:16px 0 0;text-align:center">Schedule: Day 1 → 3 → 5 → 7 → 14 → 30 · <a href="${process.env.APP_URL||'http://localhost:3000'}" style="color:#c4410c">Open app</a></p>
      </div>
    </div>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Register / get user data
app.post('/api/register', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const db = load();
  if (!db.users[email]) db.users[email] = { topics: [], joinedDate: todayStr() };
  save(db);
  res.json({ ok: true, topics: db.users[email].topics });
});

app.get('/api/topics', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const db = load();
  const user = db.users[email];
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({ topics: user.topics, week: getCurrentWeek(db), todaysSubjects: getTodaysSubjects(db) });
});

app.post('/api/topics', (req, res) => {
  const { email, name, subject } = req.body;
  if (!email || !name || !subject) return res.status(400).json({ error: 'missing fields' });
  const db = load();
  if (!db.users[email]) return res.status(404).json({ error: 'register first' });
  const t = todayStr();
  const topic = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2),
    name, subject,
    addedDate: t,
    reviewDates: INTERVALS.map(n => addDays(t, n)),
    completedReviews: [],
  };
  db.users[email].topics.push(topic);
  save(db);
  res.json({ topic });
});

app.delete('/api/topics/:id', (req, res) => {
  const { email } = req.body;
  const db = load();
  if (!db.users[email]) return res.status(404).json({ error: 'not found' });
  db.users[email].topics = db.users[email].topics.filter(t => t.id !== req.params.id);
  save(db);
  res.json({ ok: true });
});

app.post('/api/topics/:id/done', (req, res) => {
  const { email } = req.body;
  const db = load();
  const user = db.users[email];
  if (!user) return res.status(404).json({ error: 'not found' });
  const topic = user.topics.find(t => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'topic not found' });
  const t = todayStr();
  const due = topic.reviewDates.find(d => d <= t && !topic.completedReviews.includes(d));
  if (due) topic.completedReviews.push(due);
  save(db);
  res.json({ topic });
});

// Toggle week A/B
app.post('/api/week', (req, res) => {
  const { week } = req.body;
  const db = load();
  db.currentWeek = week;
  db.weekStartDate = todayStr();
  save(db);
  res.json({ week });
});

// Manual trigger
app.post('/api/send-reminders', async (req, res) => {
  const result = await runDailyReminders();
  res.json(result);
});

// ── Daily cron at 5pm AEST (UTC+10 = 07:00 UTC) ──────────────────────────────
cron.schedule('0 7 * * 1-5', async () => {
  console.log('[cron] 5pm AEST — sending reminders');
  await runDailyReminders();
});

async function runDailyReminders() {
  const db = load();
  const t = todayStr();
  const todaysSubjects = getTodaysSubjects(db);
  let sent = 0, skipped = 0;

  // Auto-add today's classes to all users' schedules
  for (const [email, user] of Object.entries(db.users)) {
    for (const subject of todaysSubjects) {
      const autoName = `${subject} — ${new Date().toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short'})}`;
      const exists = user.topics.some(tp => tp.name === autoName);
      if (!exists) {
        user.topics.push({
          id: Date.now() + '_' + Math.random().toString(36).slice(2),
          name: autoName,
          subject,
          addedDate: t,
          reviewDates: INTERVALS.map(n => addDays(t, n)),
          completedReviews: [],
          autoAdded: true,
        });
      }
    }

    const due = user.topics.filter(tp =>
      tp.reviewDates.some(d => d <= t && !tp.completedReviews.includes(d))
    );

    if (!RESEND_API_KEY) { skipped++; continue; }

    try {
      const subjectLine = due.length
        ? `📚 ${due.length} topic${due.length>1?'s':''} to recall today`
        : `📚 ${todaysSubjects.length} new classes tracked — recall.`;
      await sendEmail(email, subjectLine, buildEmail(email, due, todaysSubjects));
      sent++;
    } catch(e) {
      console.error(`Failed for ${email}:`, e.message);
      skipped++;
    }
  }

  save(db);
  return { sent, skipped, todaysSubjects };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ recall server on port ${PORT}`));
