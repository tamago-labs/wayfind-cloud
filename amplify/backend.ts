import { defineBackend } from "@aws-amplify/backend";
import { Stack } from "aws-cdk-lib";
import { Function as LambdaFunction, FunctionUrlAuthType, HttpMethod } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { wayfindApiFunction } from "./functions/wayfind-api/resource";
import { gatekeeper } from "./functions/gatekeeper/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  wayfindApiFunction,
  gatekeeper,
});

const apiLambda = backend.wayfindApiFunction.resources.lambda as LambdaFunction;
const gatekeeperLambda = backend.gatekeeper.resources.lambda as LambdaFunction;

// wayfind-api may invoke the gatekeeper on Computer requests
gatekeeperLambda.grantInvoke(apiLambda);

// wayfind-api mints MicroVM auth tokens (POST /computer/token) for the
// caller's own VM only - the handler enforces the ownership check.
apiLambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["lambda-microvms:CreateMicrovmAuthToken"],
    resources: ["*"],
  }),
);

// Inject auth + gatekeeper wiring (no secrets here — Phase 4 uses Amplify secrets)
apiLambda.addEnvironment("USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
apiLambda.addEnvironment(
  "USER_POOL_CLIENT_ID",
  backend.auth.resources.userPoolClient.userPoolClientId,
);
apiLambda.addEnvironment("GATEKEEPER_FUNCTION_NAME", gatekeeperLambda.functionName);
apiLambda.addEnvironment("CORS_ORIGIN", "https://wayfind.cloud");

const apiFunctionUrl = apiLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE, // every route verifies the Cognito JWT in the handler
  cors: {
    allowedOrigins: ["https://wayfind.cloud", "http://localhost:3000"],
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
