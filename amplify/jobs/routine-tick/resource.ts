import { defineFunction, secret } from "@aws-amplify/backend";

export const routineTickFunction = defineFunction({
  name: "routine-tick",
  schedule: "every 10m",
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: {
    // Public base of the wayfind-api Function URL (same value as
    // COMPUTER_API_URL on wayfind-api). The ticker fires due routines by
    // POSTing /routines/fire with the shared tick secret below.
    COMPUTER_API_URL: process.env.COMPUTER_API_URL ?? "",
    TICK_SECRET: secret("TICK_SECRET"),
  },
});
