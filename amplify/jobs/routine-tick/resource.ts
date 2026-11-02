import { defineFunction, secret } from "@aws-amplify/backend";

export const routineTickFunction = defineFunction({
  name: "routine-tick",
  schedule: "every 30m",
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    // COMPUTER_API_URL is wired in backend.ts from the deployed Function URL
    // (never from the synth-time shell, which silently baked in ""). The
    // ticker fires due routines by POSTing /routines/fire with the secret.
    TICK_SECRET: secret("TICK_SECRET"),
  },
});
