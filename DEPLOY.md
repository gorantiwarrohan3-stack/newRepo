# 🚀 Complete Deployment Guide - Follow This One!

**This is the ONLY file you need to follow!** All other deployment files are just reference.

Start here and follow step by step.

---

## Overview

- **Frontend**: Netlify (from GitHub)
- **Backend**: AWS Lambda + API Gateway
- **Database**: Firebase Firestore (already set up)

---

## Part 1: AWS Setup (Backend)

### Step 1: Get AWS Account Ready

1. Go to [AWS Console](https://console.aws.amazon.com)
2. Sign in or create account
3. **Add payment method** (required, but free tier won't charge you)
   - Go to Billing → Payment methods
   - Add credit/debit card
4. Wait 10-15 minutes for account activation

### Step 2: Create IAM User for Deployment

1. AWS Console → **IAM** → **Users** → **Add users**
2. Username: `prasadam-lambda-deploy`
3. Access type: ✅ **Programmatic access**
4. Click **Next: Permissions**
5. **Attach these policies:**
   - `AWSLambda_FullAccess`
   - `AmazonAPIGatewayAdministrator`
   - `SecretsManagerReadWrite`
   - `IAMFullAccess`
   - `AWSCloudFormationFullAccess` ⚠️ **Required for Serverless Framework**
   - `AmazonS3FullAccess` ⚠️ **Required for deployment artifacts**
6. Click through to create user
7. **SAVE THE CREDENTIALS:**
   - Access Key ID (starts with `AKIA...`)
   - Secret Access Key (long string - save it now!)

### Step 3: Configure AWS CLI

```bash
aws configure

# Enter:
# - Access Key ID: [from Step 2]
# - Secret Access Key: [from Step 2]
# - Default region: us-east-1
# - Default output: json
```

### Step 4: Test AWS Credentials

```bash
aws sts get-caller-identity

# Should show your account info (not an error)
```

### Step 5: Store Firebase Credentials in AWS

```bash
aws secretsmanager create-secret \
  --name firebase/service-account-key \
  --secret-string file://api/serviceAccountKey.json \
  --region us-east-1
```

---

## Part 2: Convert Flask to Lambda

### Step 6: Install Serverless Framework & Docker

```bash
npm install -g serverless@3
npm install --save-dev serverless-python-requirements
```

**⚠️ Docker Required:** You need Docker Desktop installed for building Python packages on Mac/Windows. See `DOCKER_SETUP.md` for installation instructions.

**Quick Docker Setup:**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Install and start Docker Desktop
3. Verify: `docker --version`

### Step 7: Routes Already Converted ✅

All routes from `api/app.py` have been converted to `lambda/main.py`!

The conversion follows this pattern:
- Flask: `@app.route('/api/user/<uid>')` → Returns `jsonify()`
- Lambda: `def get_user(event, context, uid)` → Returns `lambda_response()`

**You can skip this step** - all routes are ready!

**All routes have been converted! ✅**

The following routes are now in `lambda/main.py`:
1. `/health` ✅
2. `/api/create-user-with-login` ✅
3. `/api/user/<uid>` (GET) ✅
4. `/api/user/<uid>` (PUT) ✅
5. `/api/register` ✅
6. `/api/check-user` ✅
7. `/api/login-history` (POST) ✅
8. `/api/login-history/<uid>` (GET) ✅
9. `/api/offerings` (GET) ✅
10. `/api/orders` (POST) ✅
11. `/api/orders/<uid>` (GET) ✅
12. `/api/orders/<order_id>/cancel` (POST) ✅
13. `/api/orders/validate` (POST) ✅
14. `/api/subscription` (POST) ✅
15. `/api/unregister` (POST) ✅
16. All `/api/supply/*` routes ✅

**How to convert:**
1. Copy the function from `api/app.py`
2. Change `request.get_json()` → `json.loads(event.get('body', '{}'))`
3. Change `jsonify(...)` → `lambda_response(...)`
4. Add function to router in `handler()` function

### Step 8: Test Locally (Optional)

```bash
# Install serverless offline plugin
npm install --save-dev serverless-offline

# Test locally
serverless offline
```

### Step 9: Deploy Lambda

```bash
# Make sure you're in project root
serverless deploy

# This will create:
# - Lambda function
# - API Gateway
# - IAM roles
```

**After deployment, you'll see:**
```
endpoints:
  ANY - https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/{proxy+}
```

**Copy this URL** - you'll need it for Netlify!

---

## Part 3: Deploy Frontend to Netlify

### Step 10: Connect GitHub to Netlify

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub** and authorize Netlify
4. Select your repository: `gorantiwarrohan3-stack/newRepo`
5. Netlify will auto-detect settings from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`

### Step 11: Add Environment Variables

In Netlify Dashboard → Your Site → **Site settings** → **Environment variables**, add:

```
VITE_API_URL=https://xxxxx.execute-api.us-east-1.amazonaws.com/dev
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

**Where to find Firebase config:**
- Firebase Console → Project Settings → General → Your apps → Web app config

### Step 12: Deploy

- Netlify will auto-deploy on every push to `main` branch
- Or click **"Trigger deploy"** → **"Deploy site"**

---

## Part 4: Verify Everything Works

1. **Check Lambda logs:**
   ```bash
   serverless logs -f api --tail
   ```

2. **Test API endpoint:**
   ```bash
   curl https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/health
   ```

3. **Visit your Netlify site** and test:
   - Login/Registration
   - Creating orders
   - Supply owner features

---

## Troubleshooting

**AWS credentials error?**
- Follow Steps 1-4 again
- Make sure IAM user has all required policies

**Lambda deployment fails?**
- Check `lambda/main.py` has all routes converted
- Verify `serverless.yml` is correct
- Check AWS credentials: `aws sts get-caller-identity`

**CORS errors?**
- Lambda functions include CORS headers automatically
- Check API Gateway URL is correct in Netlify

**404 errors?**
- Verify `VITE_API_URL` in Netlify matches your API Gateway URL
- Check Lambda function logs for errors

---

## Quick Reference

**Files you'll edit:**
- `lambda/main.py` - Add all your API routes here
- `serverless.yml` - Already configured, usually no changes needed

**Commands you'll use:**
```bash
# Deploy Lambda
serverless deploy

# View logs
serverless logs -f api --tail

# Test locally
serverless offline
```

---

## That's It!

Follow this guide step by step. If you get stuck at any step, the error message will tell you what's wrong.

**Most common issues:**
1. AWS credentials not set up → Follow Steps 1-4
2. Routes not converted → Follow Step 7
3. Environment variables wrong → Check Step 11

Good luck! 🚀

