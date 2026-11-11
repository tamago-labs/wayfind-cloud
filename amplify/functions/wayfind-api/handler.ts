import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { CORS, json } from "./lib/respond.js";
import { verifyToken, type Claims } from "./lib/auth.js";
import type { Ctx } from "./lib/ctx.js";
import { handleUsage } from "./routes/usage.js";
import { handleRoutinesCreate, handleRoutinesFire } from "./routes/routines.js";
import { handleSyncDownloadUrls, handleSyncUploadUrls } from "./routes/sync.js";
import {
  handleAuthDevice,
  handleAuthDeviceApprove,
  handleAuthDevicePoll,
  handleAuthMe,
  handleAuthRevoke,
  handleVerifyKey,
} from "./routes/auth.js";
import {
  handleSandboxProvision,
  handleSandboxProxy,
  handleSandboxSession,
  handleSandboxTerminate,
} from "./routes/sandbox.js";
import {
  handleCheckpointBlob,
  handleCheckpointRecord,
  handleCheckpointUpload,
  handleCheckpointUrl,
  handleConversationKey,
  handleConversationMessage,
  handleConversationsCreate,
  handleConversationsList,
  handleConversationTerminate,
  handleVerificationReports,
  handleWorkspacePush,
} from "./routes/conversations.js";
import {
  handleComputerAction,
  handleComputerProvision,
  handleComputerRequest,
} from "./routes/computer.js";
import { handleComputerProxy, handleComputerToken } from "./routes/computerIO.js";
import { handleChatMessage } from "./routes/chat.js";
import { handleVerifyReceipt } from "./routes/verify.js";

/* ---------------- handler (gate + dispatch; logic lives in routes/) ---------------- */

// Bump on every backend behavior change so we can verify what's deployed
// (download the function bundle or hit /health — Amplify keeps stale code
// live when a build fails, and nothing else surfaces that).
const BACKEND_REV = "1.1.0+relay+guarded-dedupe+usage-token+presigned-sync+no-store+cli-auth+sandbox+sessions+conversations+modular-routes";

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath || event.requestContext.http.path;

  if (method === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  // Public health check
  if (path.endsWith("/health")) {
    return json(200, { ok: true, service: "wayfind-api", phase: 3, rev: BACKEND_REV });
  }

  // Pre-gate routes: public or dual-auth (own auth, no Cognito needed).
  const preCtx: Ctx = { event, method, path, ownerId: "", claims: null };
  try {
    for (const route of [
      handleUsage,
      handleRoutinesCreate,
      handleRoutinesFire,
      handleSyncUploadUrls,
      handleSyncDownloadUrls,
      handleAuthDevice,
      handleAuthDevicePoll,
      handleVerifyKey,
      handleVerifyReceipt,
    ]) {
      const res = await route(preCtx);
      if (res) return res;
    }

    // Everything below requires a verified identity: Cognito JWT or CLI token.
    let claims: Claims;
    try {
      claims = await verifyToken(event.headers.authorization ?? event.headers.Authorization);
    } catch (err) {
      return json(401, { error: `unauthorized: ${(err as Error).message}` });
    }
    const ownerId = claims.sub;
    const ctx: Ctx = { event, method, path, ownerId, claims };

    for (const route of [
      handleAuthDeviceApprove,
      handleAuthMe,
      handleAuthRevoke,
      handleSandboxProvision,
      handleSandboxSession,
      handleSandboxTerminate,
      handleConversationsCreate,
      handleConversationsList,
      handleConversationMessage,
      handleConversationTerminate,
      handleCheckpointUpload,
      handleCheckpointRecord,
      handleCheckpointUrl,
      handleCheckpointBlob,
      handleVerificationReports,
      handleConversationKey,
      handleWorkspacePush,
      handleSandboxProxy,
      handleComputerRequest,
      handleComputerProvision,
      handleComputerAction,
      handleComputerToken,
      handleComputerProxy,
      handleChatMessage,
    ]) {
      const res = await route(ctx);
      if (res) return res;
    }

    return json(404, { error: "not found" });
  } catch (err) {
    console.error("[wayfind-api] error:", err);
    return json(500, { error: "internal error" });
  }
};
