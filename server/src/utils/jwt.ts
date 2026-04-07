import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export function signToken(payload: Record<string, unknown>) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "12h" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET);
}
