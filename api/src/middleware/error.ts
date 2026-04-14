import { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error("[error]", err.message, err.stack);
  const status = (err as any).status ?? 500;
  const message = process.env.NODE_ENV === "production"
    ? "Internal server error"
    : err.message ?? "Internal server error";
  res.status(status).json({ error: message });
}
