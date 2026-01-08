# Quick Deployment Checklist

## 🚀 Deploy to Production

### Prerequisites ✅
- [ ] Code pushed to GitHub
- [ ] Firebase project created
- [ ] Netlify account created

---

## Step 1: Firebase Functions (Backend)

```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Initialize Functions
firebase init functions
# Select: Python, existing project, install dependencies

# 4. Convert Flask routes to Functions
# Copy functions/main.py.example to functions/main.py
# Convert all routes from api/app.py

# 5. Deploy
firebase deploy --only functions

# 6. Copy your function URL (shown after deployment)
# Example: https://us-central1-PROJECT_ID.cloudfunctions.net/api
```

---

## Step 2: Netlify (Frontend)

### Option A: Via Netlify Dashboard

1. Go to [app.netlify.com](https://app.netlify.com)
2. "Add new site" → "Import an existing project"
3. Connect GitHub → Select your repo
4. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables:
   ```
   VITE_API_URL=https://us-central1-YOUR_PROJECT.cloudfunctions.net/api
   VITE_FIREBASE_API_KEY=your-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```
6. Click "Deploy site"

### Option B: Via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

---

## Step 3: Verify

1. Check Firebase Functions logs:
   ```bash
   firebase functions:log
   ```

2. Check Netlify deployment:
   - Visit your Netlify site URL
   - Check browser console for errors

3. Test API endpoints:
   - Try logging in/registering
   - Test order creation

---

## Environment Variables Reference

### Netlify (Frontend)
- `VITE_API_URL` - Your Firebase Functions URL
- `VITE_FIREBASE_*` - Firebase config (from Firebase Console → Project Settings)

### Firebase Functions (Backend)
- Uses Application Default Credentials (no env vars needed for Firestore)
- For custom secrets: `firebase functions:config:set key="value"`

---

## Troubleshooting

**CORS Errors?**
- Firebase Functions handle CORS automatically
- Check that `cors_headers()` is used in all responses

**404 Errors?**
- Verify `VITE_API_URL` is correct in Netlify
- Check Firebase Functions deployment succeeded

**Authentication Errors?**
- Verify Firebase config environment variables in Netlify
- Check Firestore security rules allow reads/writes

---

## Support

- [Firebase Functions Docs](https://firebase.google.com/docs/functions)
- [Netlify Docs](https://docs.netlify.com/)
- See `DEPLOYMENT_GUIDE.md` for detailed instructions

