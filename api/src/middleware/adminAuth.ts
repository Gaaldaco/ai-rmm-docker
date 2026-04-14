import type { Request, Response, NextFunction } from "express";

/**
 * Admin authentication middleware for dashboard/operator-facing routes.
 *
 * Validates against the ADMIN_TOKEN environment variable using either:
 *   - Authorization: Bearer <token>
 *   - x-admin-token: <token>
 *
 * If ADMIN_TOKEN is not set, all requests are allowed (backwards compatibility
 * for existing deployments that haven't configured a token yet).
 */
export function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminToken = process.env.ADMIN_TOKEN;

  // If no ADMIN_TOKEN is configured, skip auth (backwards compat)
  if (!adminToken) {
    next();
    return;
  }

  // Check Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && authHeader.slice(7) === adminToken) {
    next();
    return;
  }

  // Check x-admin-token header
  const headerToken = req.headers["x-admin-token"];
  if (headerToken === adminToken) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized — valid admin token required" });
}
