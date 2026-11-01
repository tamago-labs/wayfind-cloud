import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { Function as LambdaFunction, FunctionUrlAuthType, HttpMethod } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { wayfindApiFunction } from "./functions/wayfind-api/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  wayfindApiFunction,
});

const apiLambda = backend.wayfindApiFunction.resources.lambda as LambdaFunction;

// wayfind-api mints MicroVM auth tokens (POST /computer/token) for the
// caller's own VM only - the handler enforces the ownership check.
// NOTE: IAM namespace is `lambda:` (verified via simulate-principal-policy),
// not `lambda-microvms:` — the latter silently never matches.
apiLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["lambda:CreateMicrovmAuthToken"],
    resources: ["*"],
  }),
);

// Computer lifecycle (provision/suspend/resume/terminate + status reads).
// Scoped to MicroVM control only — image builds stay a manual script.
apiLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      "lambda:RunMicrovm",
      "lambda:SuspendMicrovm",
      "lambda:ResumeMicrovm",
      "lambda:TerminateMicrovm",
      "lambda:GetMicrovm",
      "lambda:GetMicrovmImage",
      // RunMicrovm with connectors requires passing the managed connectors.
      "lambda:PassNetworkConnector",
    ],
    resources: ["*"], // microvm-ids are per-run; ownership enforced in handler
  }),
);

// Workspace sync bucket (S3): VMs read/write only their computers/* prefix.
// The bucket name is needed at synth time for the policy; the handler reads
// all runtime config via `env.X` (see functions/wayfind-api/resource.ts).
const workspaceBucket = process.env.COMPUTER_WORKSPACE_BUCKET ?? "wayfind-microvm-artifacts-ap-southeast-1";
apiLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
    resources: [`arn:aws:s3:::${workspaceBucket}/computers/*`],
  }),
);
apiLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["s3:ListBucket"],
    resources: [`arn:aws:s3:::${workspaceBucket}`],
    conditions: { StringLike: { "s3:prefix": ["computers/*"] } },
  }),
);

// All function env (auth pool IDs, CORS, computer config) is declared in
// amplify/functions/wayfind-api/resource.ts — nothing is set here, so the
// console always shows exactly what the deploy captured. Secrets stay on
// secret() and never appear as plain env.

const apiFunctionUrl = apiLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE, // every route verifies the Cognito JWT in the handler
  cors: {
    // One config for local dev + prod (wayfind.click). No wildcard.
    allowedOrigins: ["http://localhost:3000", "https://wayfind.click"],
    allowedMethods: [HttpMethod.ALL],
    allowedHeaders: ["*"],
    maxAge: Duration.minutes(5),
  },
});

backend.addOutput({
  custom: {
    wayfindApi: {
      functionUrl: apiFunctionUrl.url,
      region: Stack.of(apiLambda).region,
      functionName: apiLambda.functionName,
    },
  },
});
