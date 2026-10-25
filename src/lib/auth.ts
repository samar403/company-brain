import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, get, run } from "./db";

export type Role = "admin" | "editor" | "viewer";
export type User = { id: number; email: string; name: string; role: Role; created_at: string };

const COOKIE = "cb_session";
const SESSION_DAYS = 14;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

export function userCount(): number {
  return get<{ n: number }>("SELECT count(*) n FROM users")?.n ?? 0;
}

export function createUser(email: string, name: string, password: string, role: Role): number {
  return run(
    "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)",
    email.trim().toLowerCase(),
    name.trim(),
    hashPassword(password),
    role,
  ).id;
}

export function findUserByCredentials(email: string, password: string): User | null {
  const row = get<User & { password_hash: string }>(
    "SELECT * FROM users WHERE email = ?",
    email.trim().toLowerCase(),
  );
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const { password_hash: _ignored, ...user } = row;
  void _ignored;
  return user;
}

export async function startSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  run(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    sha256(token),
    userId,
    expires.toISOString(),
  );
  run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return (
    get<User>(
      `SELECT u.id, u.email, u.name, u.role, u.created_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      sha256(token),
      new Date().toISOString(),
    ) ?? null
  );
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

/** Guard for pages and server actions. Redirects to login when signed out. */
export async function requireUser(min: Role = "viewer"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(userCount() === 0 ? "/setup" : "/login");
  if (RANK[user.role] < RANK[min]) throw new Error(`This needs the ${min} role.`);
  return user;
}

export const can = (user: User, min: Role) => RANK[user.role] >= RANK[min];

export function listUsers(): User[] {
  return all<User>("SELECT id, email, name, role, created_at FROM users ORDER BY created_at");
}

/* ---------- API keys for agents ---------- */

export type ApiKey = {
  id: number;
  name: string;
  prefix: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function createApiKey(name: string, scopes: string[], userId: number): string {
  const secret = `cb_live_${crypto.randomBytes(24).toString("base64url")}`;
  run(
    "INSERT INTO api_keys (name, prefix, key_hash, scopes, created_by) VALUES (?, ?, ?, ?, ?)",
    name,
    secret.slice(0, 12),
    sha256(secret),
    JSON.stringify(scopes),
    userId,
  );
  return secret;
}

export function listApiKeys(): ApiKey[] {
  return all<ApiKey>(
    "SELECT id, name, prefix, scopes, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC",
  );
}

export type AgentAuth = { keyId: number; scopes: string[] };

/** Validates `Authorization: Bearer cb_live_...` (or `x-api-key`). */
export function authenticateAgent(req: Request): AgentAuth | null {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (req.headers.get("x-api-key") ?? "").trim();
  if (!token) return null;
  const row = get<{ id: number; scopes: string }>(
    "SELECT id, scopes FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
    sha256(token),
  );
  if (!row) return null;
  run("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?", row.id);
  return { keyId: row.id, scopes: JSON.parse(row.scopes) };
}
