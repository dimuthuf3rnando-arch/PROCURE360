# PROCURE360

A multi-user LAN procurement register for the Evaluation Team. It implements
the sequential **P&C Manager -> Quantity Surveyor -> P&C Engineer / Supply
Officer** handoff workflow over the 41 normalized fields of `PROCURE360.xlsx`,
with optimistic locking, field-level authorization, audited returns/overrides,
dashboard analytics, contractor scorecards and XLSX export.

## Stack

- **Backend**: FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, PyJWT + argon2.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS 3, Recharts.
- **Database**: SQLite in the native Windows bundle. PostgreSQL remains
  supported in the source repository for development and Docker deployments.
- **Deployment**: a self-contained Windows service. No Docker, WSL, Python,
  Node.js or internet connection is needed on the target PC.

## One-click Windows setup (no Docker)

1. Copy `PROCURE360-empty.zip` to the target PC.
2. If Windows marked the downloaded zip as blocked, right-click the zip,
   choose **Properties**, tick **Unblock**, then extract it.
3. Extract to a local folder such as `C:\PROCURE360`. Avoid OneDrive,
   network shares and a path that contains unusual characters.
4. Double-click **`Setup.cmd`**.
5. Approve the Windows administrator prompt.
6. Enter the first administrator email and password when prompted.
7. Wait for the progress spinner to finish. The browser opens automatically.

The bundle contains no database, users, contractors, contracts, demo accounts
or credentials. The installer creates a fresh empty register.

### What Setup.cmd does

- Generates a strong `SECRET_KEY` and writes a native `.env`.
- Creates `data\procure360.db` and runs the Alembic migrations.
- Seeds only the dropdown lists and the 20-member evaluation team, which the
  committee pickers need. No users or sample contracts are created.
- Creates the first administrator over standard input, so the password never
  appears in the command line or the setup log.
- Registers **PROCURE360** as an automatic Windows service and starts it.
- Adds a Windows Firewall rule for the chosen port.
- Starts daily SQLite backups in `data\backups` with 14-day retention.
- Opens `http://localhost:8080`.

The first setup takes about a minute. Re-running `Setup.cmd` is safe: it keeps
an existing `.env` and database, does not duplicate the administrator, and
reinstalls the service with the current files.

### Choose a different port

```powershell
.\Setup.cmd -Port 8090
```

You can also run it non-interactively:

```powershell
.\Setup.cmd -Port 8090 -AdminEmail admin@company.com -AdminPassword "your-strong-password" -NoBrowser
```

`-NonInteractive` and `-AdminPassword` are intended for unattended installs;
run them from an administrator PowerShell. Each run is recorded in
`install.log`. Use `-DryRun` to preview the steps without changing anything.

## Managing the service

```powershell
Get-Service PROCURE360
Restart-Service PROCURE360
Stop-Service PROCURE360
```

The service starts automatically at boot and restarts after a failure. Its
output is in `data\logs\service.log`; the installer log is `install.log`.

To run the app manually instead of the service:

```powershell
.\Start PROCURE360.cmd
```

Do not run the manual launcher while the Windows service is running: both
would try to use the same port.

## First sign-in

Open `http://<server-ip>:8080` from another PC, or
`http://localhost:8080` on the server. Sign in with the administrator email
and password entered during setup.

Add the other users from **Admin -> Users**. If other PCs cannot connect:

- The installer adds a firewall rule for all network profiles (Private, Domain and Public). If other PCs still cannot connect, check that port 8080 is not blocked by antivirus or group policy.
- Allow the PROCURE360 rule in Windows Defender Firewall.
- Check that the server PC is switched on and the service is running.
- Use the LAN address printed at the end of setup.

## Backups and restore

The app makes an online SQLite backup once a day in `data\backups` and keeps
14 days. The schedule and retention can be changed in `.env`:

```ini
BACKUP_ENABLED=true
BACKUP_INTERVAL_SECONDS=86400
BACKUP_RETENTION_DAYS=14
```

To restore a backup:

1. Stop the service: `Stop-Service PROCURE360`.
2. Copy the chosen `data\backups\procure360-*.db` file over
   `data\procure360.db`.
3. Delete `data\procure360.db-wal` and `data\procure360.db-shm` if present.
4. Start the service: `Start-Service PROCURE360`.

Copy the `data` folder to external storage regularly for disaster recovery.

## Uninstall

```powershell
.\Uninstall.cmd
```

This stops and removes the service and firewall rule. The `data` folder is
kept by default. To delete the database and backups as well:

```powershell
.\Uninstall.cmd -RemoveData
```

You will be asked to type `DELETE` before the data is removed.

## If another PC cannot reach PROCURE360 but other apps can

Some antivirus / "virus guard" products block the bundled `python.exe` because it is an
unknown executable, even though the app is listening on `0.0.0.0`. If the app works on the
server but other PCs get "site can't be reached", switch to the system Python (the same one
other working apps use):

```powershell
.\Use-SystemPython.ps1
```

This installs the dependencies into a private folder inside the bundle, writes
`runtime\launch.conf`, and restarts the service. It needs internet the first time. To go
back to the bundled runtime, delete `runtime\launch.conf` and restart the service.

If that still fails, temporarily disable the virus guard to confirm, then add an exception
for `C:\PROCURE360\runtime\python\python.exe` (or `procure360-service.exe`). You can also
change `APP_PORT` in `.env` to an already-allowed port such as `5000` and re-run
`Setup.cmd`.

## Troubleshooting

- **The setup window closes immediately.** Run `Setup.cmd` again and approve
  the UAC prompt, or right-click it and choose **Run as administrator**.
- **"Port 8080 is already in use."** Re-run with `-Port 8090`, or stop the
  program using that port.
- **"The service started but the app did not respond."** Check
  `data\logs\service.log` and `install.log`. The most common causes are a
  blocked port, an incomplete extraction, or antivirus quarantine.
- **Other PCs cannot connect.** Set the network to Private, allow the firewall
  rule, and use the server's LAN IP rather than `localhost`.
- **I installed into OneDrive.** Move the folder to `C:\PROCURE360` and run
  `Setup.cmd` again. OneDrive can block background services.
- **I need to move the installation.** Stop the service, move the whole folder,
  then run `Setup.cmd` again so the service path and firewall rule are updated.

The bundle contains the Python runtime and all dependencies. Setup does not
need internet access. If Windows SmartScreen or antivirus flags the unsigned
service executable, allow it only if you trust this handoff from your team.

## Development

### Backend

```powershell
cd backend
python -m venv ..\.venv
..\.venv\Scripts\activate
pip install -r requirements.txt
$env:PYTHONPATH = '.'
..\.venv\Scripts\python.exe -m alembic upgrade head
..\.venv\Scripts\python.exe -m app.seed.seed_masters --no-demo
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

The API is then available at `http://127.0.0.1:8010/api` (health:
`/api/health`). Reseed the demo portfolio with
`python -m app.seed.seed_masters --reset-demo` and set `SEED_DEMO_DATA=true`
only in a development environment.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite serves the SPA on `http://127.0.0.1:5173` (or the next free port) and
proxies `/api` to `http://127.0.0.1:8010`. Override the target with
`VITE_DEV_API_TARGET`.

Production build: `npm run build` (output in `frontend/dist`). The FastAPI app
serves that folder automatically when it exists, including React Router deep
links.

### Building the native bundle

From the repository root, with Python dependencies installed in `.venv`:

```powershell
.\build-native.ps1
```

The script builds the frontend, downloads/extracts the embeddable Python
runtime, compiles the C# service host with the built-in .NET Framework
compiler, validates the runtime, and writes `PROCURE360-empty.zip` to
`Downloads`. The zip contains no `.env`, database or test data.

### Docker (optional, source repository only)

The source repository still includes `docker-compose.yml` for a PostgreSQL
deployment. The native handoff bundle does not include or require Docker.

```bash
cp .env.example .env   # adjust secrets, ports, TZ
docker compose up -d --build
```

## Key workflows

- Only **P&C Manager** creates records and edits Orders 1-7.
- **Quantity Surveyor** edits Orders 8-20, appoints the document evaluation
  committee and bid evaluation committee from the shared staff list, and
  forwards to either the **P&C Engineer** or the **Supply Officer**.
- **P&C Engineer / Supply Officer** edits Orders 21-41 and completes the
  record. Both roles have identical rights; the QS chooses which one receives
  the file.
- Returns require a written reason (at least 5 characters) and set the record
  to `RETURNED_FOR_CORRECTION` with the previous role as owner.
- **Administrator** can edit any field in any section via **override mode**
  with a written reason; every override is recorded in the audit trail.
- Conflicting saves return HTTP 409 with the current `version`; the UI prompts
  for a reload.
- The 30-day performance-bond warning is shown in notifications and the
  contract workspace.

## Notifications and My work

- Handoffs (forward, return, complete, admin override) create per-user
  notification records for the sender, the receiving role and administrators.
- The top-bar bell polls for new notifications and raises **Windows
  notifications** via the browser Notification API. Use the bell menu's
  "Enable Windows notifications" action once to grant permission.
- Error and system toasts are also mirrored to Windows notifications.
- **My work** shows the records currently in your section or opened by you,
  plus your recent forwards/returns/completions.

## Project layout

```
backend/   FastAPI app, models, schemas, services, routers, seed, Alembic
frontend/  Vite/React SPA (dist is the prebuilt production bundle)
runtime/   Embedded Python runtime and installed dependencies (native bundle)
service/   C# Windows service host
data/      SQLite database, logs and backups (created by Setup.cmd)
install.ps1, Setup.cmd, uninstall.ps1, Uninstall.cmd
```

## Notes

- The native service listens on the `APP_PORT` in `.env` (default `8080`).
- The SQLite database runs in WAL mode so several LAN users can read while
  one writes. SQLite is appropriate for a small office; for very heavy
  concurrent write loads, use the PostgreSQL/Docker path in the source repo.
- `.env` contains the JWT secret. Keep it private and keep it with the data
  folder when moving the installation.
- No demo accounts exist in the handoff bundle. Demo data is opt-in only in
  development with `SEED_DEMO_DATA=true`.
