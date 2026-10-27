import { defineFunction } from "@aws-amplify/backend";

export const gatekeeper = defineFunction({
  name: "gatekeeper",
  timeoutSeconds: 30,
  memoryMB: 256,
  environment: {
    // Region capacity flags, e.g. {"ap-southeast-1":true}
    REGION_CAPACITY_JSON: process.env.REGION_CAPACITY_JSON ?? '{"ap-southeast-1":true}',
    DEFAULT_REGION: process.env.DEFAULT_REGION ?? "ap-southeast-1",
  },
});
