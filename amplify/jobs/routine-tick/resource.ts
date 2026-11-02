import { defineFunction, secret } from "@aws-amplify/backend";

export const routineTickFunction = defineFunction({
  name: "routine-tick",
  schedule: "every 30m",
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    // Declared here so the $amplify/env type includes it; the value is
    // overridden in backend.ts from the deployed Function URL token — never
    // from the synth-time shell, which silently baked in "". The ticker
    // fires due routines by POSTing /routines/fire with the secret.
    COMPUTER_API_URL: "",
    TICK_SECRET: secret("TICK_SECRET"),
  },
});
