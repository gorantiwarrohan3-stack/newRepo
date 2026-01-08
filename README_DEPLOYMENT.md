# Deployment Summary

## Architecture

- **Frontend**: Netlify (hosted from GitHub)
- **Backend**: AWS Lambda + API Gateway (replacing Flask)
- **Database**: Firebase Firestore

---

## Quick Start

1. **Read**: `AWS_QUICK_START.md` for fastest deployment
2. **Detailed Setup**: `AWS_LAMBDA_SETUP.md` for step-by-step instructions
3. **Conversion Guide**: `CONVERSION_GUIDE.md` for converting Flask routes

---

## File Structure

```
lambda/
  ├── main.py              # Lambda handler functions (convert from api/app.py)
  ├── handler.py           # Entry point
  ├── requirements.txt     # Python dependencies
  └── .gitignore

serverless.yml             # Serverless Framework configuration
netlify.toml               # Netlify build configuration

AWS_QUICK_START.md         # 5-step quick deployment
AWS_LAMBDA_SETUP.md        # Detailed setup instructions
CONVERSION_GUIDE.md        # Flask to Lambda conversion guide
```

---

## Deployment Steps Summary

### 1. AWS Lambda (Backend)
```bash
# Install tools
npm install -g serverless
npm install --save-dev serverless-python-requirements

# Configure AWS
aws configure

# Store Firebase credentials
aws secretsmanager create-secret --name firebase/service-account-key --secret-string file://api/serviceAccountKey.json

# Deploy
serverless deploy
```

### 2. Netlify (Frontend)
1. Connect GitHub repo
2. Set environment variable: `VITE_API_URL=<your-api-gateway-url>`
3. Deploy

---

## Environment Variables

### Netlify
- `VITE_API_URL` - Your API Gateway URL (e.g., `https://xxxxx.execute-api.us-east-1.amazonaws.com/dev`)
- `VITE_FIREBASE_*` - Firebase config variables

### AWS Lambda
- Set via `serverless.yml` or AWS Console
- `FIREBASE_SECRET_NAME` - Name of secret in Secrets Manager
- `FIREBASE_PROJECT_ID` - Your Firebase project ID

---

## Cost Estimate

- **AWS Lambda**: 1M free requests/month
- **API Gateway**: 1M free calls/month  
- **Netlify**: Free tier available
- **Total**: Essentially free for small to medium apps

---

## Support

- AWS Lambda Docs: https://docs.aws.amazon.com/lambda/
- Serverless Framework: https://www.serverless.com/framework/docs
- Netlify Docs: https://docs.netlify.com/

