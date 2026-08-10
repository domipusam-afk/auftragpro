import type { NextFunction, Request, RequestHandler, Response } from "express";
import { POLICY_MODE, type PolicyMode } from "./auth-context";
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

/**
 * Evaluates the Stage-7 matrix against the context produced by
 * legacySessionContext. It intentionally never writes a response, throws, or
 * withholds next(): Stage 10 is shadow-mode only.
 */
export function createPolicyObserver(
  dependencies: PolicyObserverDependencies = {},
): RequestHandler {
  const mode = dependencies.mode || POLICY_MODE;
  const getPolicy = dependencies.getPolicy || matchRoutePolicy;
  const log = dependencies.log || console.warn;
  const now = dependencies.now || (() => new Date());
  const summaryIntervalMs = dependencies.summaryIntervalMs || SUMMARY_INTERVAL_MS;
  let matchedRequests = 0;
  let lastSummaryAt = now().getTime();

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (mode === "off") {
      next();
      return;
    }

    if (mode === "enforce") {
      // TODO(Stage 11+): add an explicitly reviewed enforcement rollout here.
      // Do not block or otherwise alter legacy requests in Stage 10.
      next();
      return;
    }

    const policy = getPolicy(req.method, req.path);
    if (!policy) {
      next();
      return;
    }

    const hasAccess = isRoutePolicyAllowed(
      policy,
      req.legacyAuth?.rolle,
      req.legacyAuth?.berechtigungen,
    );
    // All Stage-10 routes remain unguarded. A policy denial therefore differs
    // from what the live legacy route currently permits.
    const legacyAllows = policy.currentEnforcement === "unguarded" ? true : hasAccess;
    const observation: PolicyObservation = {
      method: req.method,
      path: req.path,
      userId: req.legacyAuth?.userId || null,
      rolle: req.legacyAuth?.rolle || null,
      expected: {
        access: policy.access,
        permissions: policy.permissions,
      },
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
