import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getAuthMode, getPolicyMode, type PolicyMode } from "./auth-context";
import {
  isRoutePolicyAllowed,
  matchRoutePolicy,
  type RoutePolicy,
} from "./route-policy";

const SUMMARY_INTERVAL_MS = 5 * 60 * 1000;

interface PolicyObservation {
  method: string;
  path: string;
  userId: string | null;
  rolle: string | null;
  expected: {
    access: RoutePolicy["access"];
    permissions: readonly string[];
  };
  hasAccess: boolean;
  matchesLegacy: boolean;
  timestamp: string;
}

export interface PolicyObserverDependencies {
  mode?: PolicyMode;
  getPolicy?: (method: string, path: string) => RoutePolicy | undefined;
  log?: (line: string) => void;
  now?: () => Date;
  summaryIntervalMs?: number;
}

function requestIdentity(req: Request) {
  return getAuthMode() === "supabase" ? req.auth : req.legacyAuth;
}

/**
 * Observe retains Etappe 10's discrepancy logging. Enforce is intentionally
 * evaluated per request so POLICY_MODE can be a deploy-time emergency switch.
 */
export function createPolicyObserver(
  dependencies: PolicyObserverDependencies = {},
): RequestHandler {
  const configuredMode = dependencies.mode;
  const getPolicy = dependencies.getPolicy || matchRoutePolicy;
  const log = dependencies.log || console.warn;
  const now = dependencies.now || (() => new Date());
  const summaryIntervalMs = dependencies.summaryIntervalMs || SUMMARY_INTERVAL_MS;
  let matchedRequests = 0;
  let lastSummaryAt = now().getTime();

  return (req: Request, res: Response, next: NextFunction): void => {
    const mode = configuredMode || getPolicyMode();
    if (mode === "off") {
      next();
      return;
    }

    const policy = getPolicy(req.method, req.path);
    // Unknown endpoints keep Etappe-10 behavior. Registered public endpoints
    // must never require an auth context, even in enforce mode.
    if (!policy || policy.access === "public") {
      next();
      return;
    }

    const identity = requestIdentity(req);
    if (mode === "enforce") {
      if (!identity) {
        res.status(401).json({ ok: false, message: "Authentifizierung erforderlich" });
        return;
      }
      const hasAccess = isRoutePolicyAllowed(policy, identity.rolle, identity.berechtigungen);
      if (!hasAccess) {
        res.status(403).json({
          ok: false,
          message: "Fehlende Berechtigung",
          requiredPermission: policy.permissions.join(", "),
        });
        return;
      }
      next();
      return;
    }

    const hasAccess = isRoutePolicyAllowed(policy, identity?.rolle, identity?.berechtigungen);
    // All Stage-10 routes were still unguarded; this is the reference behavior
    // against which observe mode reports policy discrepancies.
    const legacyAllows = policy.currentEnforcement === "unguarded" ? true : hasAccess;
    const observation: PolicyObservation = {
      method: req.method,
      path: req.path,
      userId: identity?.userId || null,
      rolle: identity?.rolle || null,
      expected: { access: policy.access, permissions: policy.permissions },
      hasAccess,
      matchesLegacy: hasAccess === legacyAllows,
      timestamp: now().toISOString(),
    };

    if (!observation.matchesLegacy) {
      log(`[POLICY_OBSERVE] ${JSON.stringify(observation)}`);
    } else {
      matchedRequests += 1;
      const timestamp = now().getTime();
      if (timestamp - lastSummaryAt >= summaryIntervalMs) {
        log(`[POLICY_OBSERVE] ${JSON.stringify({
          type: "summary",
          matchedRequests,
          timestamp: new Date(timestamp).toISOString(),
        })}`);
        matchedRequests = 0;
        lastSummaryAt = timestamp;
      }
    }

    next();
  };
}

export const policyObserver = createPolicyObserver();
