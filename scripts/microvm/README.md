# MicroVM spike scripts (M1)

SDK-based test kit for AWS Lambda MicroVMs — launch, curl, suspend/resume,
terminate a hello-world app. Working calls here transfer directly into the
future `computer-manager` Lambda. Nothing here touches the app.

## Prerequisites (owner, AWS console/CLI — once)

1. **S3 bucket** in the test region for the image zip.
2. **IAM build role** for image creation:
   - Trust policy — lets Lambda assume it:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [{
         "Effect": "Allow",
         "Principal": { "Service": "lambda.amazonaws.com" },
         "Action": ["sts:AssumeRole", "sts:TagSession"]
       }]
     }
     ```
   - Permissions — read your bucket + write build logs:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         { "Effect": "Allow", "Action": ["s3:GetObject"],
           "Resource": "arn:aws:s3:::<your-bucket>/*" },
         { "Effect": "Allow", "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
           "Resource": "arn:aws:logs:*:*:*" }
       ]
     }
     ```
3. **Your own IAM principal** (the one running these scripts) needs
   `lambda-microvms:*` in the test region + `s3:PutObject` on the bucket.
4. Base image ARN for the region:
   `aws lambda-microvms list-managed-microvm-images --region <region>`

## Setup

```powershell
Copy-Item scripts/microvm/.env.example scripts/microvm/.env
# edit .env: bucket, build role ARN, base image ARN, region
```

## Run order

```powershell
npx tsx scripts/microvm/01-package-upload.ts   # zip hello-app -> S3
npx tsx scripts/microvm/02-create-image.ts     # build image, poll to CREATED (~minutes)
npx tsx scripts/microvm/03-run.ts              # run VM, wait RUNNING, curl / via auth token
npx tsx scripts/microvm/04-status.ts           # anytime status check
npx tsx scripts/microvm/05-suspend-resume.ts   # explicit suspend -> resume with timings
npx tsx scripts/microvm/06-terminate.ts        # terminate (stops charges)
npx tsx scripts/microvm/06-terminate.ts --delete-image  # also delete the test image
```

Progress is kept in `scripts/microvm/.microvm-state.json` (gitignored) so each
step picks up where the previous one left off.

## Record results in docs/DEV-HANDOFF.md §8

- Region used (MicroVMs available in `ap-southeast-1`? quotas?)
- Image build time, cold run → RUNNING latency, suspend/resume timings
- Connector ARNs that worked (if the managed defaults 404, record the real ones)
- Cost after ~24h mostly-suspended, `$5`-tier verdict

If Chromium can't run or resume latency kills chat UX, M2 re-scopes to
terminal/files first — that decision goes in §8 + the PRD changelog.

## References

- Getting started: https://docs.aws.amazon.com/lambda/latest/dg/microvms-getting-started.html
- Running/launching (incl. Node.js SDK auth example): https://docs.aws.amazon.com/lambda/latest/dg/microvms-launching.html
- JS SDK client: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda-microvms/
- Agent sandboxes blog: https://aws.amazon.com/blogs/compute/running-self-hosted-ai-agent-sandboxes-with-aws-lambda-microvms/
