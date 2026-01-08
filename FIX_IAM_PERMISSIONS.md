# Fix IAM Permissions for CloudFormation

Your IAM user `developer1` needs CloudFormation permissions to deploy with Serverless Framework.

## Quick Fix: Add CloudFormation Full Access

1. **Go to AWS Console:**
   - https://console.aws.amazon.com/iam/
   - Sign in

2. **Navigate to Users:**
   - Click "Users" in the left sidebar
   - Click on `developer1`

3. **Add Permissions:**
   - Click "Add permissions" button
   - Choose "Attach policies directly"
   - Search for: `AWSCloudFormationFullAccess`
   - Check the box
   - Click "Next"
   - Click "Add permissions"

4. **Also add these if not already attached:**
   - `AWSLambda_FullAccess` (for Lambda functions)
   - `AmazonAPIGatewayAdministrator` (for API Gateway)
   - `SecretsManagerReadWrite` (for Firebase credentials)
   - `IAMFullAccess` (for creating Lambda execution roles)

5. **Deploy again:**
   ```bash
   serverless deploy
   ```

---

## Alternative: Create Custom Policy (More Secure)

If you want more granular permissions, create a custom policy:

**Policy Name:** `ServerlessFrameworkDeploy`

**Policy Document:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "lambda:*",
        "apigateway:*",
        "iam:*",
        "logs:*",
        "s3:*",
        "secretsmanager:*",
        "events:*",
        "application-autoscaling:*"
      ],
      "Resource": "*"
    }
  ]
}
```

Then attach this policy to your `developer1` user.

---

## Verify Permissions

After adding permissions, verify:
```bash
aws sts get-caller-identity
```

This should show your account info without errors.

