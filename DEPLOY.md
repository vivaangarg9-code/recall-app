# recall. — Deploy Guide
## You'll have a live URL + 5pm emails in ~10 minutes

---

## Step 1 — Get your free Resend API key (2 min)
1. Go to **resend.com** → Sign up free (use your email)
2. Click **"API Keys"** in the sidebar → **"Create API Key"**
3. Name it "recall" → copy the key (starts with `re_...`)
4. Keep this tab open

---

## Step 2 — Upload to Railway (5 min)
1. Go to **railway.app** → Sign up free with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
   - If you don't have GitHub: click **"Empty Project"** instead → **"Add Service"** → **"GitHub Repo"**
   - Easier option: click **"New Project"** → **"Deploy from local"** and drag the whole `recall-app` folder
3. Once uploaded, click your service → go to **"Variables"** tab
4. Add these environment variables:
   ```
   RESEND_API_KEY = re_your_key_here
   FROM_EMAIL     = onboarding@resend.dev
   APP_URL        = https://your-app.railway.app  (you'll get this URL after deploy)
   PORT           = 3000
   ```
5. Click **"Deploy"** — Railway will install and start automatically

---

## Step 3 — Get your URL
- In Railway, click your service → **"Settings"** → **"Generate Domain"**
- You'll get a URL like `https://recall-app-production.up.railway.app`
- Open it in your browser — enter your email — done!

---

## How it works
- Every **school day at 5pm AEST** you get an email
- The email shows everything due for recall that day
- Your timetable is already built in (Week A and Week B)
- Toggle Week A/B in the top-right of the app
- Topics from your classes are **auto-added** every day
- You can also add topics manually in the app

## Your timetable (built in)
| | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| **Week A** | Math, English, History, Technology | Math, English, Visual Arts, PDH | History, English, Technology, Science, Math | History, English, Science, PDH | History, Visual Arts, Technology, Math, Science |
| **Week B** | Visual Arts, English, History, Math | Technology, PDH, English, Math, Drama | Technology, History, Math, English | Science, PDH, English | History, Technology, Science, Math |

## Recall schedule
After each class: **Day 1 → Day 3 → Day 5 → Day 7 → Day 14 → Day 30**

---
Need help? The app runs on port 3000 locally too — just run `npm install` then `npm start`.
