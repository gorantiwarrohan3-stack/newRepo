# Netlify Setup Guide

## If Netlify Didn't Detect `netlify.toml`

### Option 1: Reconnect Your Site (Recommended)

1. **Go to Netlify Dashboard:**
   - https://app.netlify.com
   - Sign in

2. **Find Your Site:**
   - Click on your site from the list

3. **Site Settings:**
   - Click "Site settings" in the top menu
   - Click "Build & deploy" in the left sidebar
   - Click "Link to Git provider"

4. **Re-link Repository:**
   - Click "Change site name or link"
   - Select "Change how Netlify builds your site"
   - Choose "GitHub"
   - Select repository: `gorantiwarrohan3-stack/newRepo`
   - Select branch: `main`
   - Click "Save"

5. **Netlify will auto-detect `netlify.toml`** from your repository

---

### Option 2: Manual Configuration

If auto-detection still doesn't work:

1. **Go to Build & Deploy Settings:**
   - Netlify Dashboard → Your Site → Site settings → Build & deploy

2. **Configure Build Settings:**
   - **Base directory:** Leave empty (root)
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - Click "Save"

3. **Environment Variables:**
   - Site settings → Environment variables → Add variable
   - Add these:
     ```
     VITE_API_URL=https://sm35qynvsc.execute-api.us-east-1.amazonaws.com/dev
     VITE_FIREBASE_API_KEY=your-firebase-api-key
     VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your-project-id
     VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
     VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
     VITE_FIREBASE_APP_ID=your-app-id
     ```

4. **Trigger New Deploy:**
   - Go to "Deploys" tab
   - Click "Trigger deploy" → "Deploy site"

---

### Option 3: Verify File Location

Make sure `netlify.toml` is at the **root** of your repository:

```bash
# From your project root
ls -la netlify.toml
```

It should be in the same directory as `package.json`, not in a subdirectory.

---

## Verify It's Working

After reconnecting:

1. **Check Build Logs:**
   - Netlify Dashboard → Your Site → Deploys
   - Click on the latest deploy
   - Look for: "Detected `netlify.toml`"

2. **Check Build Settings:**
   - Site settings → Build & deploy
   - You should see the settings from `netlify.toml` automatically applied

---

## Current `netlify.toml` Configuration

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"

[[plugins]]
  package = "@netlify/plugin-lighthouse"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

This configuration:
- ✅ Builds with `npm run build`
- ✅ Publishes the `dist` folder
- ✅ Uses Node.js 18
- ✅ Redirects all routes to `index.html` (for React Router)
- ✅ Includes Lighthouse plugin for performance monitoring

---

## Troubleshooting

**If Netlify still doesn't detect the file:**

1. **Check file name:** Must be exactly `netlify.toml` (lowercase, no spaces)
2. **Check file location:** Must be in repository root
3. **Check Git:** File must be committed and pushed to `main` branch
4. **Clear cache:** Netlify Dashboard → Site settings → Build & deploy → Clear cache and retry deploy

