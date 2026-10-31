import { defineFunction, secret } from "@aws-amplify/backend";

export const wayfindApiFunction = defineFunction({
  name: "wayfind-api",
  timeoutSeconds: 300,
  memoryMB: 1024,
  // Provider keys for /hooks/run injection (read in-handler at provision
  // time, passed to the VM, never stored). Set values with:
  //   npx ampx sandbox secret set MODAL_API_KEY
  //   npx ampx sandbox secret set PROVIDER_API_KEY
  environment: {
    MODAL_API_KEY: secret("MODAL_API_KEY"),
    PROVIDER_API_KEY: secret("PROVIDER_API_KEY"),
  },
});
