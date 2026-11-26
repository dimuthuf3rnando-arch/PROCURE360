# PROCURE360 — v2 (one-click online installer)

This bundle is the lean version of PROCURE360. It contains the application source,
prebuilt web interface and Windows service host — but **not** a bundled Python runtime
or preinstalled libraries.

**Setup.cmd downloads and installs everything automatically** using the Python already
installed on the server PC.

## Requirements

- Windows 10/11 or Windows Server 2016+
- **Python 3.11 or newer** installed and added to PATH (download from python.org, tick
  "Add Python to PATH" during installation)
- Internet access on the server PC for the first setup
- Administrator rights (for the Windows service and firewall rule)

## One-click setup

1. Extract `PROCURE360-v2.zip` to a local folder such as `C:\PROCURE360`
   (avoid OneDrive and network shares).
2. Double-click **`Setup.cmd`** and approve the UAC prompt.
3. Enter the first administrator email and password when prompted.
4. Wait for setup to finish — the browser opens automatically.

Setup.cmd will:
- Find the system Python
- `pip install` all dependencies into `runtime\system-site-packages` (inside the bundle,
  so the system Python installation is not modified)
- Write `runtime\launch.conf` so the Windows service uses the system Python
- Create `.env` with a random secret and write the SQLite configuration
- Run migrations and seed only dropdowns + the 20-member evaluation team (no demo
  users, contractors or contracts)
- Create the first administrator
- Register and start the PROCURE360 Windows service (automatic, restarts on failure)
- Add a Windows Firewall rule for the chosen port (all profiles)
- Enable daily SQLite backups in `data\backups` (14-day retention)

## Using the app

- On the server: `http://localhost:8080`
- From other PCs: `http://<server-ip>:8080`
- Default port is 8080. Change it in `.env` (`APP_PORT=...`) and re-run `Setup.cmd`.

## Managing the service

```powershell
Get-Service PROCURE360
Restart-Service PROCURE360
Stop-Service PROCURE360
```

Logs: `data\logs\service.log` and `install.log`.

To run manually instead of as a service: `Start PROCURE360.cmd` (do not run it while
the service is running).

## Changing Python / reinstalling dependencies

Re-run `Setup.cmd` at any time. It reuses the existing `.env` and database and does not
duplicate the administrator.

## Uninstall

```
Uninstall.cmd
```

Stops and removes the service and firewall rule. The `data` folder is kept by default.
Use `Uninstall.cmd -RemoveData` to delete the database and backups too.

## Troubleshooting

- **"No system Python was found"** — install Python 3.11+ from python.org, tick
  "Add Python to PATH", then re-run Setup.cmd.
- **Dependency installation fails** — check the internet connection; PyPI must be reachable.
- **Service starts but other PCs cannot connect** — a virus guard / antivirus may be
  blocking the Python executable. Add an exception for the system Python shown in
  `runtime\launch.conf`, or change `APP_PORT` in `.env` to an already-allowed port
  (e.g. 5000) and re-run Setup.cmd.
- **Port in use** — re-run with `.\Setup.cmd -Port 8090`.

## Notes

- The frontend is prebuilt in `frontend/dist`; Node.js is not needed on the server.
- The database is SQLite; for heavy concurrent write loads use the PostgreSQL/Docker
  variant from the source repository.
- Keep `.env` and the `data` folder private and back them up together.
