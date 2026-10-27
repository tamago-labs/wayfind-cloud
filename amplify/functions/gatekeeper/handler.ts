import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/gatekeeper";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
Amplify.configure(resourceConfig, libraryOptions);
const dataClient = generateClient<Schema>();

interface GatekeeperEvent {
  computerId: string;
  ownerId: string;
  emailVerified?: boolean;
}

interface GatekeeperResult {
  computerId: string;
  gateStatus: "approved" | "queued" | "rejected";
  gateReason: string;
  rule: string;
}

/**
 * Gatekeeper (PRD §11): decides whether an account may have a Computer.
 * Rules, in order — first failing rule decides, and the rule is recorded:
 *  1. account verified (email verified at sign-in)
 *  2. owner has no other approved/active Computer (one per account)
 *  3. region capacity flag is open
 * Approval here records intent only; MicroVM provisioning is Phase 6.
 */
export const handler = async (event: GatekeeperEvent): Promise<GatekeeperResult> => {
  const { computerId, ownerId } = event;
  const decidedAt = new Date().toISOString();

  const decide = async (
    gateStatus: GatekeeperResult["gateStatus"],
    gateReason: string,
    rule: string,
  ): Promise<GatekeeperResult> => {
    await dataClient.models.Computer.update({
      id: computerId,
      gateStatus,
      gateReason,
      decidedAt,
    });
    console.log(
      JSON.stringify({ gatekeeper: "decision", computerId, ownerId, gateStatus, rule, decidedAt }),
    );
    return { computerId, gateStatus, gateReason, rule };
  };

  // Rule 1 — verified account
  if (!event.emailVerified) {
    return decide("rejected", "Account email is not verified yet.", "account_verified");
  }

  // Load the computer + owner profile + any other computers for this owner
  const { data: computer } = await dataClient.models.Computer.get({ id: computerId });
  if (!computer) {
    throw new Error(`gatekeeper: Computer ${computerId} not found`);
  }

  const { data: computers } = await dataClient.models.Computer.computerByOwnerId({
    ownerId,
  });
  const otherActive = (computers ?? []).filter(
    (c) => c.id !== computerId && c.gateStatus === "approved",
  );

  // Rule 2 — one Computer per account
  if (otherActive.length > 0) {
    return decide(
      "rejected",
      "This account already has a Computer. One computer per account — it is shared by all your Bots.",
      "one_computer_per_account",
    );
  }

  // Rule 3 — region capacity
  let capacity: Record<string, boolean> = {};
  try {
    capacity = JSON.parse(env.REGION_CAPACITY_JSON ?? "{}");
  } catch {
    capacity = {};
  }
  const region = computer.region ?? env.DEFAULT_REGION ?? "ap-southeast-1";
  if (capacity[region] !== true) {
    return decide(
      "queued",
      `Computers are not open in ${region} yet. Your request is queued and first in line when the region opens.`,
      "region_capacity",
    );
  }

  return decide(
    "approved",
    "Approved — provisioning opens with the Computer (MicroVM) rollout. No computer exists yet, and nothing is charged.",
    "approved",
  );
};
