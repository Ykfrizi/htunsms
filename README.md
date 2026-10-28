# HTU National Service Personnel Management System

HTU-NSPMS is a local portal for Ho Technical University's National Service application, HR review, deployment, and reporting workflows. The browser app now uses a local Express API and the MariaDB server bundled with XAMPP; Firebase is not required to run the portal.

## Local requirements

- Windows with XAMPP installed.
- Apache and MySQL (MariaDB) running from the XAMPP Control Panel.
- Node.js 20 or later and npm.

## First-time setup

1. Install the project dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`. Update the MySQL host, port, username, and password to match your XAMPP installation. The configured database name is `htu nspms`.
3. Create the database tables by importing `database/schema.sql` in phpMyAdmin, or run this from PowerShell:

   ```powershell
   Get-Content -Raw -Encoding UTF8 .\database\schema.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   If your MySQL root account has a password, add `-p` to the command and enter it when prompted. The schema uses `CREATE DATABASE IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS`; it does not drop existing data.
4. Start the API and frontend together:

   ```powershell
   npm run dev:all
   ```

5. Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

The API binds to `127.0.0.1` and is intended for local development on this PC. Do not expose this XAMPP setup to the internet or use it for production HR records without a security, backup, and privacy review.

## Database and account behavior

The schema creates `users`, `personnel`, `nss_registry`, `applications`, `units`, `deployments`, `audit_logs`, `auth_sessions`, `auth_tokens`, and `system_settings` in the requested database. NSS and Ghana Card identifiers are unique; the API checks their formats and enforces uniqueness in MySQL.

Passwords are hashed with bcrypt. Session tokens are random, stored only as hashes in MySQL, and sent to the browser using an HttpOnly, same-site cookie. New accounts receive only the `personnel` role. In local development, verification and password-reset links are printed in the API terminal and are also shown in the browser when appropriate. SMTP delivery is not configured.

HR and supervisor roles are never granted by the public registration form. After registering an account, an authorized local administrator can assign an explicit role and permissions, for example:

```powershell
node server/set-role.js hr@example.com hr applications:read,applications:review,personnel:read,deployments:assign
node server/set-role.js supervisor@example.com supervisor reporting:confirm,reporting:read unit-ho-hr
```

The role-setting script changes permissions directly in the local database. Only trusted administrators should run it. Configure units in the `units` table before assigning personnel or supervisor unit access.

After signing in with an administrator account, open **User management** in the portal to manage account roles, permissions, and supervisor unit access. The last active administrator cannot be suspended or demoted from the page.

## Firebase data

The app no longer connects to Firebase. The local schema starts empty; existing Firebase Authentication users and Firestore records are not automatically downloaded or imported. Existing records must be exported from Firebase and mapped to the local schema before they can be used here. Keep a protected backup of any Firebase export and verify record counts and relationships before switching users over.

## Checks

- `npm test` runs frontend validation tests.
- `npm run build` type-checks and builds the frontend.
- `npm run dev:all` starts the local API and Vite development server together.
- `GET http://127.0.0.1:3001/api/health` checks API-to-MySQL connectivity.

The backend includes authenticated endpoints for registration, login, email verification, password reset, application submission and reads, HR decisions, deployment assignments, and reporting confirmations. The portal currently exposes only the registration, login, password reset, application overview, and application submission screens; the other operations require authorized API clients or future portal UI.
