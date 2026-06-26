import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export function swaggerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="API Docs"');
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const base64 = authHeader.split(" ")[1];
  const decoded = Buffer.from(base64, "base64").toString("utf-8");
  const [username, password] = decoded.split(":");

  if (username !== env.DOCS_USER || password !== env.DOCS_PASSWORD) {
    res.setHeader("WWW-Authenticate", 'Basic realm="API Docs"');
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  next();
}
