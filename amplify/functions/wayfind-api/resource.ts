import { defineFunction } from "@aws-amplify/backend";

export const wayfindApiFunction = defineFunction({
  name: "wayfind-api",
  timeoutSeconds: 90,
  memoryMB: 512,
  environment: {
    WAYFIN_API: "true",
    OKX_API_KEY: process.env.OKX_API_KEY ?? "",
    OKX_SECRET_KEY: process.env.OKX_SECRET_KEY ?? "",
    OKX_PASSPHRASE: process.env.OKX_PASSPHRASE ?? "",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  },
});
