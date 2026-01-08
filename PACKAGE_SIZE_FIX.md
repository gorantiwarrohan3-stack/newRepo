# Fixing Lambda Package Size Issue

The Lambda deployment package is too large (344 MB, limit is 250 MB). This is because `firebase-admin` and `google-cloud-firestore` are very large packages.

## Solution Options:

### Option 1: Use Container Images (Recommended)
Container images have a 10 GB limit vs 250 MB for zip files.

Update `serverless.yml`:
```yaml
provider:
  name: aws
  runtime: provided.al2  # or provided.al2023
  # ... rest of config
```

Then use Docker to build the image. See AWS Lambda Container Image documentation.

### Option 2: Minimize Dependencies
Try using only the essential parts:

Update `requirements.txt`:
```txt
firebase-admin==6.5.0
# Remove google-cloud-firestore if firebase-admin already includes it
```

### Option 3: Split into Multiple Layers
Create separate layers for different dependency groups.

### Option 4: Use AWS Lambda Layers
Pre-build a layer with dependencies separately and reference it.

---

## Current Status
The deployment is failing because:
- Function code + layer = 344 MB
- AWS Lambda limit = 250 MB (unzipped)

Try Option 1 (Container Images) for easiest solution.

