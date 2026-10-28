import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const [emailArgument, role, permissionsArgument = "-", unitIdsArgument = "-"] = process.argv.slice(2);
const validRoles = new Set(["personnel", "hr", "supervisor", "administrator"]);
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

if (!emailArgument || !validRoles.has(role)) {
  console.error("Usage: node server/set-role.js <email> <role> [permission,permission] [unitId,unitId]");
  console.error(`Roles: ${[...validRoles].join(", ")}`);
  process.exit(1);
}

const permissions = permissionsArgument === "-" ? [] : permissionsArgument.split(",").filter(Boolean);
const unitIds = unitIdsArgument === "-" ? [] : unitIdsArgument.split(",").filter(Boolean);
const unknown = permissions.filter((permission) => !validPermissions.has(permission));
if (unknown.length) {
  console.error(`Unknown permissions: ${unknown.join(", ")}`);
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "htu nspms",
});

try {
  const [result] = await pool.execute(
    "UPDATE users SET role = ?, permissions = ?, unit_ids = ?, updated_at = UTC_TIMESTAMP(3) WHERE email = ?",
    [role, JSON.stringify(permissions), JSON.stringify(unitIds), emailArgument.toLowerCase()],
  );
  if (!result.affectedRows) {
    console.error("No account found for that email. Register the account first.");
    process.exitCode = 1;
  } else {
    console.info(`Updated role and explicit permissions for ${emailArgument}.`);
  }
} catch (error) {
  console.error("Could not update the role:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
