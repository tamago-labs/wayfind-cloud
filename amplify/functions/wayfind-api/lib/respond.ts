import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const CORS = {
  // No Access-Control-Allow-Origin here: the Function URL layer sets it
  // (allowedOrigins in backend.ts). Sending it twice breaks browsers.
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json",
  // API responses must never be cached: a cached 410 for a proxy GET kept a
  // dead VM "dead" in the browser long after recovery (same URL re-fires).
  "Cache-Control": "no-store",
};

export const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});
