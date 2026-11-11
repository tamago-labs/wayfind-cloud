// VerificationReport builder for the NEAR Verification Center widget
// (iframe + postMessage). Converts our stored evidence (preflight +
// per-message 06 checks, in receipt.inference or live /bot/evidence)
// into the widget's report format.
//
// Honesty mapping — the viewer checks structure, NOT evidence:
// - TCB is 'Unknown' (no dcap-qvl here — upstream scope) and deployment
//   provenance is 'not_checked', so model scope reports are 'partial',
//   never 'verified'. Gateway scope is likewise 'partial' with an
//   unattested TLS binding (browser runtimes can't observe the peer).
// - Response reports: one completion per array (widget rule). The route
//   serves the latest valid checked message by default, or ?chatId=.
// - Anything unattributable (no signer, failed checks) becomes 'failed'
//   with a safe error message — never silently dropped.
export interface WidgetSigner {
  signingAlgo: "ecdsa";
  signingAddress: string;
}

export interface WidgetReport {
  schemaVersion: 1;
  kind: "model" | "response";
  model?: string;
  scope: "model" | "gateway" | "unknown";
  status: "verified" | "partial" | "failed" | "unverifiable";
  completionId?: string;
  signature?: {
    kind: "provider_tee" | "gateway";
    signer: WidgetSigner;
    signedText: string;
    signature: string;
  };
  attestation?: {
    signer: WidgetSigner;
    tcbStatus: "Unknown";
    advisoryIds: string[];
    deploymentProvenance: "not_checked";
    deployment: { runtimeMeasurements: Record<string, never> };
    gpuEvidence?: "verified" | "not_provided";
    tlsBinding?: { kind: "none" } | { kind: "attested"; spkiFingerprint: string };
  };
  error?: { message: string };
}

interface EvidenceMessage {
  seq?: number;
  chatId?: string | null;
  checked?: boolean;
  kind?: string;
  valid?: boolean;
  signer?: string | null;
  signedText?: string | null;
  signature?: string | null;
}

interface Evidence {
  preflight?: {
    nonce?: string;
    model?: string;
    nodes?: number;
    nonceEchoed?: boolean;
    modelTee?: string[];
    gateway?: string[];
    nvidia?: { overall?: boolean; nonceMatch?: boolean | null; gpus?: number } | null;
  } | null;
  messages?: EvidenceMessage[];
}

function modelSigner(preflight: NonNullable<Evidence["preflight"]>): WidgetSigner | null {
  const addr = preflight.modelTee?.[0];
  return addr ? { signingAlgo: "ecdsa", signingAddress: addr } : null;
}

function gatewaySigner(preflight: NonNullable<Evidence["preflight"]>): WidgetSigner | null {
  const addr = preflight.gateway?.[0];
  return addr ? { signingAlgo: "ecdsa", signingAddress: addr } : null;
}

export function toVerificationReports(
  model: string,
  evidence: Evidence | null,
  chatId?: string,
): WidgetReport[] {
  if (!evidence?.preflight) {
    return [
      {
        schemaVersion: 1,
        kind: "model",
        model,
        scope: "unknown",
        status: "unverifiable",
        error: { message: "no attestation evidence retained for this conversation" },
      },
    ];
  }
  const pre = evidence.preflight;
  const reports: WidgetReport[] = [];
  const mSigner = modelSigner(pre);
  const gSigner = gatewaySigner(pre);

  if (mSigner) {
    const gpuOk = pre.nvidia?.overall === true && pre.nvidia?.nonceMatch === true;
    reports.push({
      schemaVersion: 1,
      kind: "model",
      model: pre.model ?? model,
      scope: "model",
      status: pre.nonceEchoed && gpuOk ? "partial" : "failed",
      ...(pre.nonceEchoed && gpuOk
        ? {}
        : { error: { message: "model attestation evidence incomplete (nonce echo or NVIDIA verdict missing)" } }),
      attestation: {
        signer: mSigner,
        tcbStatus: "Unknown",
        advisoryIds: [],
        deploymentProvenance: "not_checked",
        deployment: { runtimeMeasurements: {} },
        gpuEvidence: pre.nvidia?.overall === true ? "verified" : "not_provided",
      },
    });
  }
  if (gSigner) {
    reports.push({
      schemaVersion: 1,
      kind: "model",
      model: pre.model ?? model,
      scope: "gateway",
      status: "partial",
      attestation: {
        signer: gSigner,
        tcbStatus: "Unknown",
        advisoryIds: [],
        deploymentProvenance: "not_checked",
        deployment: { runtimeMeasurements: {} },
        tlsBinding: { kind: "none" },
      },
    });
  }

  const msgs = (evidence.messages ?? []).filter(
    (m): m is EvidenceMessage & { chatId: string; signedText: string; signature: string; signer: string } =>
      !!m?.checked && !!m.chatId && !!m.signedText && !!m.signature && !!m.signer &&
      (m.kind === "provider_tee" || m.kind === "gateway"),
  );
  const picked = chatId
    ? msgs.find((m) => m.chatId === chatId) ?? null
    : [...msgs].reverse().find((m) => m.valid) ?? null;
  if (picked && mSigner && gSigner) {
    const scope = picked.kind === "provider_tee" ? "model" : "gateway";
    const signer = scope === "model" ? mSigner : gSigner;
    const signerMatches = signer.signingAddress.toLowerCase() === picked.signer.toLowerCase();
    reports.push({
      schemaVersion: 1,
      kind: "response",
      completionId: picked.chatId,
      model: pre.model ?? model,
      scope,
      status: picked.valid && signerMatches ? "partial" : "failed",
      ...(picked.valid && signerMatches
        ? {}
        : { error: { message: "response signature did not verify against the retained attestation" } }),
      signature: {
        kind: picked.kind as "provider_tee" | "gateway",
        signer,
        signedText: picked.signedText,
        signature: picked.signature,
      },
      attestation: {
        signer,
        tcbStatus: "Unknown",
        advisoryIds: [],
        deploymentProvenance: "not_checked",
        deployment: { runtimeMeasurements: {} },
        ...(scope === "model"
          ? { gpuEvidence: pre.nvidia?.overall === true ? ("verified" as const) : ("not_provided" as const) }
          : { tlsBinding: { kind: "none" } as const }),
      },
    });
  }
  return reports;
}
