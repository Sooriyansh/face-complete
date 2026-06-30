# Windows Activity Agent

Production Windows employee activity collector for the FaceAI Attendance server.

## What it captures

- Windows sign in/out, lock/unlock, sleep/wake, shutdown/restart from Event Viewer.
- Idle, active, session duration, last activity, boot time, uptime.
- Network online/offline.
- Active application/window switches.
- Supported browser foreground usage for Chrome, Edge, Firefox, Brave, and Opera.
- Process start/stop events from real process snapshots.

The agent does not generate demo data. Events are sent to `/api/system-events/ingest` with `x-collector-token` and are deduplicated by `externalId`.

## Configure

Copy `.env.example` to `.env`. The agent auto-detects safe defaults:

```text
FACEAI_SERVER_URL=
FACEAI_COLLECTOR_TOKEN=
FACEAI_EMPLOYEE_ID=
FACEAI_EMPLOYEE_NAME=
```

`FACEAI_SERVER_URL` is inferred from `FACEAI_PUBLIC_URL`, `PUBLIC_URL`, `APP_URL`, `BASE_URL`, common production host variables, or local `PORT`.
`FACEAI_COLLECTOR_TOKEN` is inferred from `SYSTEM_EVENTS_COLLECTOR_TOKEN` when the main server `.env` is available.
Employee ID/name fall back to the current Windows user. Set explicit values when you need a different HRMS employee code or production public URL.

## Run once

```powershell
npm run once
```

## Install on Windows startup

Run PowerShell as the employee user:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-startup-task.ps1
```

The task runs at logon and restarts after failures. Use a service account or endpoint-management tool for fleet deployment.
