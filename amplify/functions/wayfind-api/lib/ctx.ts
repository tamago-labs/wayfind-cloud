import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { Claims } from "./auth.js";

/** Per-request context threaded through every route handler. */
export interface Ctx {
  event: APIGatewayProxyEventV2;
  method: string;
  path: string;
  /** Verified owner (Cognito sub or CLI userId). Set after the gate. */
  ownerId: string;
  /** Verified claims. Null for pre-gate (public / dual-auth) routes. */
  claims: Claims | null;
}

export type RouteResult = APIGatewayProxyStructuredResultV2 | null;

/** A route handler: returns a response when it claims the request, null to pass through. */
export type Route = (ctx: Ctx) => Promise<RouteResult>;
