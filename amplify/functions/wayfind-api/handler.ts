import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/wayfind-api";
import type { Schema } from "../../data/resource";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { createVerify, createPublicKey } from "crypto";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
Amplify.configure(resourceConfig, libraryOptions);
const dataClient = generateClient<Schema>();
const lambda = new LambdaClient({});

/* ---------------- Cognito JWT verification (no external deps) ---------------- */

interface Claims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  token_use?: string;
  aud?: string;
  exp: number;
  iss: string;
  [k: string]: unknown;
}

let jwksCache: { fetchedAt: number; keys: Map<string, ReturnType<typeof createPublicKey>> } | null = null;

async function getPublicKey(kid: string, iss: string) {
  const now = Date.now();
  if (!jwksCache || now - jwksCache.fetchedAt > 60 * 60 * 1000) {
    const res = await fetch(`${iss}/.well-known/jwks.json`);
    if (!res.ok) throw new Error("jwks fetch failed");
    const jwks = (await res.json()) as { keys: Array<{ kid: string }> };
    const keys = new Map<string, ReturnType<typeof createPublicKey>>();
    for (const jwk of jwks.keys) {
      keys.set(jwk.kid, createPublicKey({ key: jwk as never, format: "jwk" }));
    }
    jwksCache = { fetchedAt: now, keys };
  }
  const key = jwksCache.keys.get(kid);
  if (!key) throw new Error("unknown kid");
  return key;
}

async function verifyToken(authHeader: string | undefined): Promise<Claims> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("missing bearer token");
  const token = authHeader.slice(7);
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("malformed token");

  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as Claims;

  const poolId = process.env.USER_POOL_ID;
  const region = process.env.AWS_REGION;
  if (!poolId || !region) throw new Error("auth not configured");
  const expectedIss = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
  if (claims.iss !== expectedIss) throw new Error("bad issuer");
  if (claims.exp * 1000 < Date.now()) throw new Error("token expired");
  if (claims.token_use !== "id" && claims.token_use !== "access") throw new Error("bad token use");
  const clientId = process.env.USER_POOL_CLIENT_ID;
  if (claims.token_use === "id" && clientId && claims.aud !== clientId) throw new Error("bad audience");

  const key = await getPublicKey(header.kid, expectedIss);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  const ok = verifier.verify(key, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("bad signature");
  return claims;
}

/* ---------------- helpers ---------------- */

const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "https://wayfind.cloud",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

function parseBody(event: APIGatewayProxyEventV2): Record<string, unknown> {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return {};
  }
}

async function ensureProfile(claims: Claims) {
  const { data: existing } = await dataClient.models.UserProfile.profileByOwnerId({
    ownerId: claims.sub,
  });
  if (existing && existing.length > 0) return existing[0];
  const { data: created, errors } = await dataClient.models.UserProfile.create({
    ownerId: claims.sub,
    email: claims.email ?? "",
    plan: "free",
  });
  if (errors || !created) throw new Error(`profile create failed: ${JSON.stringify(errors)}`);
  return created;
}

/* ---------------- handler ---------------- */

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath || event.requestContext.http.path;

  if (method === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  // Public health check
  if (path.endsWith("/health")) {
    return json(200, { ok: true, service: "wayfind-api", phase: 3 });
  }

  // Everything below requires a verified Cognito token
  let claims: Claims;
  try {
    claims = await verifyToken(event.headers.authorization ?? event.headers.Authorization);
  } catch (err) {
    return json(401, { error: `unauthorized: ${(err as Error).message}` });
  }
  const ownerId = claims.sub;

  try {
    // GET /me — return (creating on first call) the caller's profile
    if (path.endsWith("/me") && method === "GET") {
      const profile = await ensureProfile(claims);
      return json(200, { data: profile });
    }

    // POST /bots — create a Bot (name + Finder face + job)
    if (path.endsWith("/bots") && method === "POST") {
      const profile = await ensureProfile(claims);
      const body = parseBody(event);
      const name = String(body.name ?? "").trim();
      const job = String(body.job ?? "").trim();
      if (!name || !job) return json(400, { error: "name and job are required" });
      const finder = (["inbox", "leads", "research", "repo", "custom"].includes(String(body.finder))
        ? String(body.finder)
        : "custom") as "inbox" | "leads" | "research" | "repo" | "custom";
      const { data: bot, errors } = await dataClient.models.Bot.create({
        ownerId,
        userProfileId: profile.id,
        name,
        finder,
        job,
        description: body.description ? String(body.description) : undefined,
        status: "active",
      });
      if (errors || !bot) return json(500, { error: `bot create failed: ${JSON.stringify(errors)}` });
      return json(201, { data: bot });
    }

    // GET /bots — the caller's roster
    if (path.endsWith("/bots") && method === "GET") {
      const { data: bots } = await dataClient.models.Bot.botsByOwnerId({ ownerId });
      return json(200, { data: bots ?? [] });
    }

    // POST /computer/request — create (or return) the Computer request, then gatekeep
    if (path.endsWith("/computer/request") && method === "POST") {
      const profile = await ensureProfile(claims);
      const { data: existing } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
      let computer = existing?.[0];
      if (!computer) {
        const { data: created, errors } = await dataClient.models.Computer.create({
          ownerId,
          userProfileId: profile.id,
          gateStatus: "pending",
          provisionStatus: "not_provisioned",
          region: "ap-southeast-1",
          requestedAt: new Date().toISOString(),
        });
        if (errors || !created) {
          return json(500, { error: `computer create failed: ${JSON.stringify(errors)}` });
        }
        computer = created;
      }
      const gatekeeperName = process.env.GATEKEEPER_FUNCTION_NAME;
      if (computer.gateStatus === "pending" && gatekeeperName) {
        const result = await lambda.send(
          new InvokeCommand({
            FunctionName: gatekeeperName,
            InvocationType: "RequestResponse",
            Payload: JSON.stringify({
              computerId: computer.id,
              ownerId,
              emailVerified: claims.email_verified === true || claims.email_verified === "true",
            }),
          }),
        );
        const payload = result.Payload ? JSON.parse(Buffer.from(result.Payload).toString()) : {};
        const { data: updated } = await dataClient.models.Computer.get({ id: computer.id });
        return json(200, { data: updated ?? computer, decision: payload });
      }
      return json(200, { data: computer });
    }

    // POST /chat/message — Phase 4 (chat + model runtime). Honest stub.
    if (path.endsWith("/chat/message")) {
      return json(501, {
        error: "chat runtime arrives in Phase 4 (chat + model). Your Bots, account and Computer request are real; no work was run.",
        phase: 4,
      });
    }

    return json(404, { error: "not found" });
  } catch (err) {
    console.error("[wayfind-api] error:", err);
    return json(500, { error: "internal error" });
  }
};
