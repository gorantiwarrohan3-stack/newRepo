# Fix S3 Permissions for Deployment

Your IAM user needs S3 permissions for Serverless Framework to create deployment buckets and store artifacts.

## Quick Fix: Add S3 Full Access

1. **Go to AWS Console:**
   - https://console.aws.amazon.com/iam/
   - Sign in

2. **Navigate to Users:**
   - Click "Users" in the left sidebar
   - Click on `developer1`

3. **Add S3 Permissions:**
   - Click "Add permissions" button
   - Choose "Attach policies directly"
   - Search for: `AmazonS3FullAccess`
   - Check the box
   - Click "Next"
   - Click "Add permissions"

4. **Deploy again:**
   ```bash
   serverless deploy
   ```

---

## Complete List of Required Policies

Make sure your IAM user has all these policies:

✅ `AWSLambda_FullAccess`
✅ `AmazonAPIGatewayAdministrator`
✅ `SecretsManagerReadWrite`
✅ `IAMFullAccess`
✅ `AWSCloudFormationFullAccess`
✅ `AmazonS3FullAccess` ⚠️ **Add this one!**

---

## Alternative: More Granular S3 Permissions

If you prefer minimal permissions, create a custom policy that only allows S3 operations needed for Serverless:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:PutBucketTagging"
      ],
      "Resource": "*"
    }
  ]
}
```

But `AmazonS3FullAccess` is simpler and safer for development.

