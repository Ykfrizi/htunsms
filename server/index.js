import dotenv from "dotenv";
import crypto from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const port = Number(process.env.API_PORT ?? 3001);
const cookieName = process.env.SESSION_COOKIE_NAME ?? "htu_session";
const sessionTtlMs = Number(process.env.SESSION_TTL_HOURS ?? 12) * 60 * 60 * 1000;
const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:5173";
const apiOrigin = process.env.API_ORIGIN ?? `http://127.0.0.1:${port}`;
const isProduction = process.env.NODE_ENV === "production";

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "htu nspms",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  dateStrings: true,
});

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const signupSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  nssNumber: z.string().trim().regex(/^[A-Z]{3}\d{12}$/),
  nationalId: z.string().trim().regex(/^GHA-\d{9}-\d$/),
  telephone: z.string().trim().regex(/^(?:\+233|0)[\d\s()-]{9,14}$/),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const applicationSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  qualification: z.enum(["BTech", "BSc", "HND", "2-Year Diploma", "Other"]),
  programme: z.string().trim().min(2).max(160),
  intakeId: z.string().trim().min(2).max(80),
  telephone: z.string().trim().regex(/^(?:\+233|0)[\d\s()-]{9,14}$/),
  solicitorName: z.string().trim().max(120).optional().default(""),
  solicitorContact: z.string().trim().max(254).optional().default(""),
  requestedUnitId: z.string().trim().max(120).optional().default(""),
  positionInterest: z.enum(["", "department_support", "teaching_assistant"]).optional().default(""),
});

const randomToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const permissionsFor = (user) => Array.isArray(user.permissions) ? user.permissions : JSON.parse(user.permissions ?? "[]");
const unitIdsFor = (user) => Array.isArray(user.unit_ids) ? user.unit_ids : JSON.parse(user.unit_ids ?? "[]");

function serializeUser(user) {
  return {
    uid: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_verified_at),
    displayName: user.full_name,
    role: user.role,
    permissions: permissionsFor(user),
    unitIds: unitIdsFor(user),
  };
}

function setSessionCookie(res, token) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: sessionTtlMs,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/" });
}

function localLink(path, token) {
  return `${apiOrigin}/api/auth/${path}?token=${encodeURIComponent(token)}`;
}

async function issueEmailToken(userId, purpose) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + (purpose === "verify_email" ? 24 : 1) * 60 * 60 * 1000);
  await pool.execute("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?", [userId, purpose]);
  await pool.execute(
    "INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)",
    [hashToken(token), userId, purpose, expiresAt],
  );
  const path = purpose === "verify_email" ? "verify-email" : "reset-password";
  const link = localLink(path, token);
  if (isProduction) {
    throw new ApiError(503, "email-not-configured", "Email delivery is not configured. Ask the administrator to configure SMTP before using this feature.");
  }
  console.info(`[local ${purpose} link for ${userId}] ${link}`);
  return link;
}

async function optionalAuth(req, res, next) {
  const token = req.cookies[cookieName];
  if (!token) return next();
  try {
    const [rows] = await pool.execute(
      `SELECT u.* FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) AND u.account_status = 'active'
       LIMIT 1`,
      [hashToken(token)],
    );
    if (rows[0]) req.user = rows[0];
    else clearSessionCookie(res);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new ApiError(401, "unauthenticated", "Sign in to continue."));
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !permissionsFor(req.user).includes(permission)) {
      return next(new ApiError(403, "permission-denied", "You are not authorized to perform this action."));
    }
    next();
  };
}

function requireAdministrator(req, res, next) {
  if (!req.user || req.user.role !== "administrator") {
    return next(new ApiError(403, "permission-denied", "Administrator access is required."));
  }
  next();
}

function audit(connection, { actor, action, targetId, reason = null }) {
  return connection.execute(
    "INSERT INTO audit_logs (actor_uid, actor_role, action, target_id, reason) VALUES (?, ?, ?, ?, ?)",
    [actor?.id ?? null, actor?.role ?? "system", action, targetId, reason],
  );
}

function sendHtml(res, title, message) {
  res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · HTU Portal</title><body style="font:16px system-ui;max-width:620px;margin:10vh auto;padding:24px;color:#18213b"><h1>${title}</h1><p>${message}</p><p>You may close this page and return to the HTU National Service Portal.</p></body></html>`);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && origin) {
    const allowed = new Set([appOrigin, `${req.protocol}://${req.get("host")}`]);
    if (!allowed.has(origin)) return next(new ApiError(403, "origin-denied", "This request origin is not allowed."));
  }
  next();
});
app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie ?? "";
  req.cookies = Object.fromEntries(cookieHeader.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return ["", ""];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
  next();
});
app.use(optionalAuth);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { code: "too-many-requests", error: "Too many account requests. Wait a little while, then try again." },
});

app.get("/api/health", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ready");
    res.json({ ok: rows[0].ready === 1, database: process.env.DB_NAME ?? "htu nspms" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.user ? serializeUser(req.user) : null });
});

app.get("/api/units", requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.unit_type, u.department_id, u.supervisor_uid, s.full_name AS supervisor_name
       FROM units u LEFT JOIN users s ON s.id = u.supervisor_uid
       WHERE u.active = TRUE ORDER BY u.unit_type, u.name`,
    );
    res.json({ units: rows.map((unit) => ({
      id: unit.id,
      name: unit.name,
      unitType: unit.unit_type,
      departmentId: unit.department_id,
      supervisorId: unit.supervisor_uid,
      supervisorName: unit.supervisor_name,
    })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/units", requireAuth, requireAdministrator, async (req, res, next) => {
  try {
    const [[units], [supervisors]] = await Promise.all([
      pool.execute(
        `SELECT u.id, u.name, u.unit_type, u.department_id, u.supervisor_uid, u.active, s.full_name AS supervisor_name
         FROM units u LEFT JOIN users s ON s.id = u.supervisor_uid
         ORDER BY u.unit_type, u.name`,
      ),
      pool.execute(
        "SELECT id, full_name, email FROM users WHERE role = 'supervisor' AND account_status = 'active' ORDER BY full_name",
      ),
    ]);
    res.json({
      units: units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        unitType: unit.unit_type,
        departmentId: unit.department_id,
        supervisorId: unit.supervisor_uid,
        supervisorName: unit.supervisor_name,
        active: Boolean(unit.active),
      })),
      supervisors: supervisors.map((supervisor) => ({
        id: supervisor.id,
        name: supervisor.full_name,
        email: supervisor.email,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/units/:unitId", requireAuth, requireAdministrator, async (req, res, next) => {
  const parsed = z.object({
    supervisorId: z.string().uuid().nullable(),
    active: z.boolean(),
  }).safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", "Choose an active supervisor or leave the unit unassigned."));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [units] = await connection.execute("SELECT id, name, supervisor_uid FROM units WHERE id = ? FOR UPDATE", [req.params.unitId]);
    if (!units.length) throw new ApiError(404, "not-found", "That unit does not exist.");
    if (parsed.data.supervisorId) {
      const [supervisors] = await connection.execute(
        "SELECT id FROM users WHERE id = ? AND role = 'supervisor' AND account_status = 'active' FOR UPDATE",
        [parsed.data.supervisorId],
      );
      if (!supervisors.length) throw new ApiError(400, "invalid-argument", "The selected account is not an active supervisor.");
    }
    await connection.execute(
      "UPDATE units SET supervisor_uid = ?, active = ? WHERE id = ?",
      [parsed.data.supervisorId, parsed.data.active, req.params.unitId],
    );
    for (const supervisorId of new Set([units[0].supervisor_uid, parsed.data.supervisorId].filter(Boolean))) {
      const [assignedUnits] = await connection.execute(
        "SELECT id FROM units WHERE supervisor_uid = ? AND active = TRUE ORDER BY id",
        [supervisorId],
      );
      await connection.execute(
        "UPDATE users SET unit_ids = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?",
        [JSON.stringify(assignedUnits.map((unit) => unit.id)), supervisorId],
      );
    }
    await audit(connection, {
      actor: req.user,
      action: "admin.unit_updated",
      targetId: req.params.unitId,
      reason: `supervisor=${parsed.data.supervisorId ?? "none"}; active=${parsed.data.active}`,
    });
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", parsed.error.issues[0]?.message ?? "Check the registration details."));
  const data = parsed.data;
  const email = data.email.toLowerCase();
  const telephone = data.telephone.replace(/[\s()-]/g, "");
  if (!/^(?:\+233|0)\d{9}$/.test(telephone)) return next(new ApiError(400, "invalid-argument", "Enter a valid Ghanaian telephone number."));
  const passwordHash = await bcrypt.hash(data.password, 12);
  const userId = crypto.randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingEmail] = await connection.execute("SELECT id FROM users WHERE email = ? FOR UPDATE", [email]);
    const [existingIdentity] = await connection.execute(
      "SELECT user_id FROM personnel WHERE nss_number = ? OR national_id = ? LIMIT 1 FOR UPDATE",
      [data.nssNumber, data.nationalId],
    );
    if (existingEmail.length || existingIdentity.length) {
      throw new ApiError(409, "already-exists", "An account already exists for this email, NSS number, or Ghana Card number.");
    }
    await connection.execute(
      `INSERT INTO users (id, email, password_hash, full_name, telephone, permissions, unit_ids)
       VALUES (?, ?, ?, ?, ?, JSON_ARRAY(), JSON_ARRAY())`,
      [userId, email, passwordHash, data.fullName, telephone],
    );
    await connection.execute(
      "INSERT INTO personnel (user_id, nss_number, national_id, full_name) VALUES (?, ?, ?, ?)",
      [userId, data.nssNumber, data.nationalId, data.fullName],
    );
    await connection.execute("INSERT INTO nss_registry (nss_number, user_id) VALUES (?, ?)", [data.nssNumber, userId]);
    await audit(connection, { actor: { id: userId, role: "personnel" }, action: "personnel.registered", targetId: userId });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") return next(new ApiError(409, "already-exists", "An account already exists for this email, NSS number, or Ghana Card number."));
    return next(error);
  } finally {
    connection.release();
  }
  const verifyUrl = await issueEmailToken(userId, "verify_email");
  const sessionToken = randomToken();
  await pool.execute("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(sessionToken), userId, new Date(Date.now() + sessionTtlMs),
  ]);
  setSessionCookie(res, sessionToken);
  const [users] = await pool.execute("SELECT * FROM users WHERE id = ?", [userId]);
  res.status(201).json({ user: serializeUser(users[0]), verificationUrl: isProduction ? undefined : verifyUrl });
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", "Enter a valid email address and password."));
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [parsed.data.email.toLowerCase()]);
  const user = rows[0];
  if (!user || user.account_status !== "active" || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return next(new ApiError(401, "invalid-credential", "The email or password is incorrect."));
  }
  const token = randomToken();
  await pool.execute("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token), user.id, new Date(Date.now() + sessionTtlMs),
  ]);
  setSessionCookie(res, token);
  res.json({ user: serializeUser(user) });
});

app.post("/api/auth/logout", requireAuth, async (req, res, next) => {
  try {
    await pool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hashToken(req.cookies[cookieName])]);
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/verification/resend", requireAuth, authLimiter, async (req, res, next) => {
  if (req.user.email_verified_at) return res.json({ success: true, alreadyVerified: true });
  const verificationUrl = await issueEmailToken(req.user.id, "verify_email");
  res.json({ success: true, verificationUrl: isProduction ? undefined : verificationUrl });
});

app.get("/api/auth/verify-email", async (req, res, next) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return sendHtml(res, "Invalid verification link", "The link is missing its token. Request a new verification link from the portal.");
  try {
    const [result] = await pool.execute(
      `UPDATE users u JOIN auth_tokens t ON t.user_id = u.id
       SET u.email_verified_at = UTC_TIMESTAMP(3), u.updated_at = UTC_TIMESTAMP(3)
       WHERE t.token_hash = ? AND t.purpose = 'verify_email' AND t.expires_at > UTC_TIMESTAMP(3)`,
      [hashToken(token)],
    );
    await pool.execute("DELETE FROM auth_tokens WHERE token_hash = ?", [hashToken(token)]);
    if (!result.affectedRows) return sendHtml(res, "Link expired", "This verification link is invalid or expired. Sign in and request another link.");
    res.setHeader("Refresh", `4; url=${appOrigin}`);
    sendHtml(res, "Email verified", "Your email is verified. You can now submit your application.");
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/password-reset", authLimiter, async (req, res, next) => {
  const parsed = z.string().trim().email().max(254).safeParse(req.body.email);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", "Enter a valid email address."));
  const [rows] = await pool.execute("SELECT id FROM users WHERE email = ? AND account_status = 'active' LIMIT 1", [parsed.data.toLowerCase()]);
  if (!rows.length) return res.json({ success: true });
  const resetUrl = await issueEmailToken(rows[0].id, "reset_password");
  res.json({ success: true, resetUrl: isProduction ? undefined : resetUrl });
});

app.get("/api/auth/reset-password", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token.replace(/[<>"&']/g, "") : "";
  if (!token) return sendHtml(res, "Invalid reset link", "The password reset link is missing its token.");
  res.type("html").send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Reset password · HTU Portal</title><body style="font:16px system-ui;max-width:620px;margin:10vh auto;padding:24px;color:#18213b"><h1>Reset your password</h1><form method="post" action="/api/auth/reset-password/complete"><input type="hidden" name="token" value="${token}"><label>New password <input name="password" type="password" minlength="10" required autocomplete="new-password"></label><p><label>Confirm password <input name="confirmation" type="password" minlength="10" required autocomplete="new-password"></label></p><button type="submit">Update password</button></form></body></html>`);
});

app.post("/api/auth/reset-password/complete", authLimiter, async (req, res, next) => {
  const { token, password, confirmation } = req.body ?? {};
  if (typeof token !== "string" || token.length !== 64 || typeof password !== "string" || password.length < 10 || password.length > 128 || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password) || password !== confirmation) {
    return sendHtml(res, "Password not changed", "Use at least 10 characters including a number and symbol, and ensure both password fields match.");
  }
  try {
    const [rows] = await pool.execute(
      "SELECT user_id FROM auth_tokens WHERE token_hash = ? AND purpose = 'reset_password' AND expires_at > UTC_TIMESTAMP(3) LIMIT 1",
      [hashToken(token)],
    );
    if (!rows.length) return sendHtml(res, "Link expired", "This password reset link is invalid or expired. Request a new one from the portal.");
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute("UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [passwordHash, rows[0].user_id]);
    await pool.execute("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = 'reset_password'", [rows[0].user_id]);
    await pool.execute("DELETE FROM auth_sessions WHERE user_id = ?", [rows[0].user_id]);
    sendHtml(res, "Password updated", "Your password has been changed. You can now sign in with the new password.");
  } catch (error) {
    next(error);
  }
});

app.get("/api/applications", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "personnel" && !permissionsFor(req.user).includes("applications:read")) {
      throw new ApiError(403, "permission-denied", "You are not authorized to view applications.");
    }
    const [rows] = req.user.role === "personnel"
      ? await pool.execute(
        `SELECT a.*, u.email AS personnel_email, u.email_verified_at AS personnel_email_verified,
                p.nss_number, p.national_id, a.qualification, COALESCE(u.email, a.personnel_email) AS personnel_email,
                a.solicitor_name, a.solicitor_contact,
                a.requested_unit_id, a.position_interest,
                (SELECT d.status FROM deployments d WHERE d.application_id = a.id ORDER BY d.assigned_at DESC LIMIT 1) AS deployment_status,
                (SELECT d.reported_at FROM deployments d WHERE d.application_id = a.id ORDER BY d.assigned_at DESC LIMIT 1) AS deployment_reported_at,
                requested.name AS requested_unit_name
         FROM applications a
         LEFT JOIN users u ON u.id = a.personnel_uid
         LEFT JOIN personnel p ON p.user_id = a.personnel_uid
         LEFT JOIN units requested ON requested.id = a.requested_unit_id
         WHERE a.personnel_uid = ? ORDER BY a.created_at DESC LIMIT 1`,
        [req.user.id],
      )
      : await pool.execute(
        `SELECT a.*, u.email AS personnel_email, u.email_verified_at AS personnel_email_verified,
                p.nss_number, p.national_id, a.qualification, COALESCE(u.email, a.personnel_email) AS personnel_email,
                a.solicitor_name, a.solicitor_contact,
                a.requested_unit_id, a.position_interest,
                (SELECT d.status FROM deployments d WHERE d.application_id = a.id ORDER BY d.assigned_at DESC LIMIT 1) AS deployment_status,
                (SELECT d.reported_at FROM deployments d WHERE d.application_id = a.id ORDER BY d.assigned_at DESC LIMIT 1) AS deployment_reported_at,
                requested.name AS requested_unit_name
         FROM applications a
         LEFT JOIN users u ON u.id = a.personnel_uid
         LEFT JOIN personnel p ON p.user_id = a.personnel_uid
         LEFT JOIN units requested ON requested.id = a.requested_unit_id
         ORDER BY a.submitted_at DESC LIMIT 100`,
      );
    res.json({ applications: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      personnelUid: row.personnel_uid,
      fullName: row.full_name,
      programme: row.programme,
      qualification: row.qualification,
      intakeId: row.intake_id,
      telephone: row.telephone,
      applicationStatus: row.application_status,
      verificationStatus: row.verification_status,
      decisionReason: row.decision_reason,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
      personnelEmail: row.personnel_email,
      personnelEmailVerified: Boolean(row.personnel_email_verified),
      nssNumber: row.nss_number,
      nationalId: row.national_id,
      deploymentStatus: row.deployment_status,
      reportedAt: row.deployment_reported_at,
      solicitorName: row.solicitor_name,
      solicitorContact: row.solicitor_contact,
      requestedUnitId: row.requested_unit_id,
      positionInterest: row.position_interest,
      requestedUnitName: row.requested_unit_name,
    })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireAuth, requireAdministrator, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, email, full_name, role, permissions, unit_ids, account_status, email_verified_at, created_at
       FROM users ORDER BY created_at DESC LIMIT 500`,
    );
    res.json({ users: rows.map((user) => ({
      uid: user.id,
      email: user.email,
      displayName: user.full_name,
      role: user.role,
      permissions: permissionsFor(user),
      unitIds: unitIdsFor(user),
      accountStatus: user.account_status,
      emailVerified: Boolean(user.email_verified_at),
      createdAt: user.created_at,
    })) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/users/:userId", requireAuth, requireAdministrator, async (req, res, next) => {
  const validPermissions = new Set([
    "applications:read",
    "applications:review",
    "personnel:read",
    "deployments:assign",
    "deployments:read",
    "reporting:confirm",
    "reporting:read",
    "audit:read",
    "users:read",
  ]);
  const parsed = z.object({
    role: z.enum(["personnel", "hr", "supervisor", "administrator"]),
    permissions: z.array(z.string()).max(20),
    unitIds: z.array(z.string().trim().min(1).max(120)).max(100),
    accountStatus: z.enum(["active", "suspended"]),
  }).safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", "Provide a valid role, permissions, units, and account status."));
  if (parsed.data.permissions.some((permission) => !validPermissions.has(permission))) {
    return next(new ApiError(400, "invalid-argument", "One or more permissions are not recognized."));
  }
  if (parsed.data.role !== "supervisor" && parsed.data.unitIds.length) {
    return next(new ApiError(400, "invalid-argument", "Only supervisors can be assigned units."));
  }
  if (req.params.userId === req.user.id &&
      (parsed.data.role !== "administrator" || parsed.data.accountStatus !== "active")) {
    return next(new ApiError(400, "invalid-argument", "You cannot remove your own active administrator access."));
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute("SELECT id, role FROM users WHERE id = ? FOR UPDATE", [req.params.userId]);
    const target = users[0];
    if (!target) throw new ApiError(404, "not-found", "That account does not exist.");
    if (target.role === "administrator" &&
        (parsed.data.role !== "administrator" || parsed.data.accountStatus !== "active")) {
      const [admins] = await connection.execute(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'administrator' AND account_status = 'active'",
      );
      if (Number(admins[0].total) <= 1) {
        throw new ApiError(409, "failed-precondition", "The last active administrator cannot be demoted or suspended.");
      }
    }
    await connection.execute(
      `UPDATE users SET role = ?, permissions = ?, unit_ids = ?, account_status = ?, updated_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [parsed.data.role, JSON.stringify(parsed.data.permissions), JSON.stringify(parsed.data.unitIds), parsed.data.accountStatus, target.id],
    );
    await audit(connection, {
      actor: req.user,
      action: "admin.user_access_updated",
      targetId: target.id,
      reason: `role=${parsed.data.role}; status=${parsed.data.accountStatus}`,
    });
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post("/api/applications", requireAuth, async (req, res, next) => {
  if (req.user.role !== "personnel") return next(new ApiError(403, "permission-denied", "Only personnel may submit an application."));
  if (!req.user.email_verified_at) return next(new ApiError(403, "failed-precondition", "Verify your email before submitting an application."));
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", parsed.error.issues[0]?.message ?? "Check the application details."));
  const connection = await pool.getConnection();
  const applicationId = crypto.randomUUID();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute("SELECT id FROM users WHERE id = ? AND account_status = 'active' FOR UPDATE", [req.user.id]);
    if (!users.length) throw new ApiError(403, "permission-denied", "Your account is not active.");
    const [existing] = await connection.execute(
      "SELECT id FROM applications WHERE personnel_uid = ? AND application_status IN ('DRAFT', 'SUBMITTED', 'RESUBMITTED') LIMIT 1",
      [req.user.id],
    );
    if (existing.length) throw new ApiError(409, "already-exists", "An active application already exists.");
    await connection.execute(
      `INSERT INTO system_settings (setting_key, numeric_value) VALUES ('next_application_reference', 1)
       ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)`,
    );
    const [counters] = await connection.execute(
      "SELECT numeric_value FROM system_settings WHERE setting_key = 'next_application_reference' FOR UPDATE",
    );
    const sequence = Number(counters[0].numeric_value);
    await connection.execute(
      "UPDATE system_settings SET numeric_value = ? WHERE setting_key = 'next_application_reference'",
      [sequence + 1],
    );
    const reference = `HTU-NS-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
    const data = parsed.data;
    if (data.requestedUnitId) {
      const [requestedUnits] = await connection.execute(
        "SELECT id FROM units WHERE id = ? AND active = TRUE LIMIT 1",
        [data.requestedUnitId],
      );
      if (!requestedUnits.length) throw new ApiError(400, "invalid-argument", "Select an active requesting department or unit.");
    }
    await connection.execute(
      `INSERT INTO applications
       (id, personnel_uid, reference, full_name, programme, qualification, personnel_email, intake_id, telephone, solicitor_name, solicitor_contact, requested_unit_id, position_interest, application_status, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', 'PENDING')`,
      [
        applicationId, req.user.id, reference, data.fullName, data.programme, data.qualification, req.user.email,
        data.intakeId, data.telephone.replace(/[\s()-]/g, ""), data.solicitorName || null, data.solicitorContact || null,
        data.requestedUnitId || null, data.positionInterest || null,
      ],
    );
    await audit(connection, { actor: req.user, action: "application.submitted", targetId: applicationId });
    await connection.commit();
    res.status(201).json({ applicationId, reference });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post("/api/applications/:applicationId/decision", requireAuth, requirePermission("applications:review"), async (req, res, next) => {
  const parsed = z.object({
    decision: z.enum(["APPROVED", "REJECTED", "CORRECTION_REQUIRED"]),
    reason: z.string().trim().min(1).max(2000),
    verificationStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", "Provide a valid decision and reason."));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT * FROM applications WHERE id = ? FOR UPDATE", [req.params.applicationId]);
    const application = rows[0];
    if (!application || !["SUBMITTED", "RESUBMITTED"].includes(application.application_status)) {
      throw new ApiError(409, "failed-precondition", "This application is not ready for review.");
    }
    const { decision, reason, verificationStatus } = parsed.data;
    const nextVerificationStatus = verificationStatus ?? application.verification_status;
    if (decision === "APPROVED" && nextVerificationStatus !== "VERIFIED") {
      throw new ApiError(409, "failed-precondition", "Verify all required checks before approval.");
    }
    await connection.execute(
      `UPDATE applications SET application_status = ?, verification_status = ?, decision_reason = ?,
       decided_by = ?, decided_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [decision, nextVerificationStatus, reason, req.user.id, application.id],
    );
    await audit(connection, { actor: req.user, action: `application.${decision.toLowerCase()}`, targetId: application.id, reason });
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post("/api/deployments", requireAuth, requirePermission("deployments:assign"), async (req, res, next) => {
  const parsed = z.object({
    applicationId: z.string().uuid(),
    unitId: z.string().trim().min(1).max(120),
    reportingLocation: z.string().trim().min(1).max(240),
    reportingDate: z.string().date(),
  }).safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", "Provide a valid application, unit, reporting location and date."));
  const connection = await pool.getConnection();
  const deploymentId = crypto.randomUUID();
  try {
    await connection.beginTransaction();
    const [applications] = await connection.execute("SELECT * FROM applications WHERE id = ? FOR UPDATE", [parsed.data.applicationId]);
    const application = applications[0];
    if (!application || application.application_status !== "APPROVED") throw new ApiError(409, "failed-precondition", "Only approved personnel can be deployed.");
    const [units] = await connection.execute("SELECT * FROM units WHERE id = ? AND active = TRUE FOR UPDATE", [parsed.data.unitId]);
    if (!units.length) throw new ApiError(409, "failed-precondition", "Select an active configured unit.");
    const [active] = await connection.execute("SELECT id FROM deployments WHERE personnel_uid = ? AND status = 'ACTIVE' LIMIT 1", [application.personnel_uid]);
    if (active.length) throw new ApiError(409, "already-exists", "This person already has an active deployment.");
    const unit = units[0];
    await connection.execute(
      `INSERT INTO deployments
       (id, application_id, personnel_uid, unit_id, department_id, supervisor_uid, reporting_location, reporting_date, assigned_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [deploymentId, application.id, application.personnel_uid, unit.id, unit.department_id, unit.supervisor_uid, parsed.data.reportingLocation, parsed.data.reportingDate, req.user.id],
    );
    await audit(connection, { actor: req.user, action: "deployment.assigned", targetId: deploymentId });
    await connection.commit();
    res.status(201).json({ success: true, deploymentId });
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") {
      return next(new ApiError(409, "already-exists", "This person already has an active deployment."));
    }
    next(error);
  } finally {
    connection.release();
  }
});

app.post("/api/deployments/:deploymentId/report", requireAuth, requirePermission("reporting:confirm"), async (req, res, next) => {
  const parsed = z.object({ reportDate: z.string().date() }).safeParse(req.body);
  if (!parsed.success) return next(new ApiError(400, "invalid-argument", "Provide a valid report date."));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT * FROM deployments WHERE id = ? FOR UPDATE", [req.params.deploymentId]);
    const deployment = rows[0];
    if (!deployment || deployment.status !== "ACTIVE") throw new ApiError(409, "failed-precondition", "This deployment is not active.");
    if (!unitIdsFor(req.user).includes(deployment.unit_id)) throw new ApiError(403, "permission-denied", "You are not assigned to this unit.");
    await connection.execute(
      `UPDATE deployments SET status = 'REPORTED', reported_at = UTC_TIMESTAMP(3), report_date = ?,
       confirmed_by = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [parsed.data.reportDate, req.user.id, deployment.id],
    );
    await audit(connection, { actor: req.user, action: "reporting.confirmed", targetId: deployment.id });
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof ApiError) return res.status(error.status).json({ code: error.code, error: error.message });
  console.error("API request failed:", error);
  res.status(500).json({ code: "internal", error: "The server could not complete the request." });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.info(`HTU local API listening at http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
