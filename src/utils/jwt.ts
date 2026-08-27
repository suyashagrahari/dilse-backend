import jwt from "jsonwebtoken";
import { env } from "../config/env";

interface TokenPayload {
  userId: string;
  email: string;
  /**
   * Token version. Compared against `User.tokenVersion` by `protect`; a bump
   * on the user invalidates every token already handed out.
   *
   * Optional on purpose. Tokens minted before this field existed carry no `tv`
   * claim, and users hold access tokens for a day and refresh tokens for a
   * month — treating a missing claim as 0 (the schema default) is what stops
   * this deploy from logging out every signed-in user.
   */
  tv?: number;
}

/**
 * An impersonation session. Signed with the same secret as an access token so
 * one `verify` covers both, but carries `imp` and `act` so `protect` can tell
 * the two apart and refuse the things an impersonator must not do.
 */
export interface ImpersonationPayload extends TokenPayload {
  imp: true;
  /** The super admin actually behind the session ("actor"). */
  act: string;
  actEmail: string;
}

/** Deliberately short. An impersonation session cannot be refreshed — when it
 *  expires the admin starts a new one, and that start is audited again. */
export const IMPERSONATION_TTL_SECONDS = 15 * 60;

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1d" });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): TokenPayload | ImpersonationPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload | ImpersonationPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

export function generateImpersonationToken(args: {
  targetUserId: string;
  targetEmail: string;
  targetTokenVersion: number;
  actorId: string;
  actorEmail: string;
}): string {
  const payload: ImpersonationPayload = {
    userId: args.targetUserId,
    email: args.targetEmail,
    tv: args.targetTokenVersion,
    imp: true,
    act: args.actorId,
    actEmail: args.actorEmail,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: IMPERSONATION_TTL_SECONDS });
}

export function isImpersonation(
  p: TokenPayload | ImpersonationPayload
): p is ImpersonationPayload {
  return (p as ImpersonationPayload).imp === true;
}
