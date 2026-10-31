import { defineFunction, secret } from "@aws-amplify/backend";

export const wayfindApiFunction = defineFunction({
  name: "wayfind-api",
  timeoutSeconds: 300,
  memoryMB: 1024,
  // Deploy-time config (same pattern as the wayfin project): sandbox .env /
  // CI env values are captured here; the handler reads them via `env.X`.
  // Provider keys use Amplify secrets (never plain env, never stored):
  //   npx ampx sandbox secret set MODAL_API_KEY
  //   npx ampx sandbox secret set PROVIDER_API_KEY
  environment: {
    COMPUTER_IMAGE_ARN: process.env.COMPUTER_IMAGE_ARN ?? "",
    COMPUTER_WORKSPACE_BUCKET: process.env.COMPUTER_WORKSPACE_BUCKET ?? "",
    COMPUTER_REGION: process.env.COMPUTER_REGION ?? "ap-southeast-1",
    MODAL_API_KEY: secret("MODAL_API_KEY"),
    PROVIDER_API_KEY: secret("PROVIDER_API_KEY"),
  },
});
