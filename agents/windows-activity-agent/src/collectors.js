const os = require('os');
const config = require('./config');
const { json } = require('./powershell');

const BROWSER_PROCESSES = new Set(['chrome', 'msedge', 'firefox', 'brave', 'opera', 'opera_gx']);

function currentUser() {
  const info = os.userInfo();
  return process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${info.username}` : info.username;
}

function baseEvent(name, meaning, details = {}) {
  const occurredAt = details.occurredAt ? new Date(details.occurredAt) : new Date();
  const millis = occurredAt.getTime();
  const source = details.sourceLog || 'FaceAIWindowsAgent';
  const provider = details.provider || 'NodeWindowsAgent';
  const identity = `${config.agentId}:${name}:${details.unique || millis}`;
  return {
    event: name,
    meaning,
    occurredAt: occurredAt.toISOString(),
    eventId: Number(details.eventId || 0),
    sourceLog: source,
    provider,
    recordNumber: details.recordNumber || null,
    computer: config.computer,
    employeeId: config.employeeId,
    employeeName: config.employeeName,
    user: currentUser(),
    durationMs: Math.max(Number(details.durationMs || 0), 0),
    status: details.status || 'Recorded',
    message: details.message || meaning,
    metadata: {
      agentId: config.agentId,
      ...(details.metadata || {}),
    },
    externalId: details.externalId || `${source}:${identity}`,
  };
}

async function collectEventLogEvents(state) {
  const script = `
    $maps = @{
      System = @(6005,6006,6008,1074,42,1);
      Security = @(4800,4801,4624,4634,4778,4779)
    }
    $rows = @()
    foreach ($log in $maps.Keys) {
      try {
        $events = Get-WinEvent -FilterHashtable @{ LogName = $log; Id = $maps[$log] } -MaxEvents ${config.eventLogLookback} -ErrorAction Stop
        foreach ($event in $events) {
          $rows += [pscustomobject]@{
            LogName = $log
            Id = $event.Id
            ProviderName = $event.ProviderName
            RecordId = $event.RecordId
            TimeCreated = $event.TimeCreated.ToUniversalTime().ToString("o")
            MachineName = $event.MachineName
            Message = [string]$event.Message
          }
        }
      } catch {}
    }
    $rows
  `;
  const rows = await json(script, []);
  const events = [];
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const names = {
    6005: ['Startup', 'Windows event log service started.'],
    6006: ['Shutdown', 'Windows event log service stopped.'],
    6008: ['Unexpected Shutdown', 'Windows detected an unexpected shutdown.'],
    42: ['Sleep', 'The system entered sleep.'],
    1: ['System Wake', 'The system resumed from sleep.'],
    4800: ['Screen Lock', 'The workstation was locked.'],
    4801: ['Screen Unlock', 'The workstation was unlocked.'],
    4624: ['Windows Sign In', 'Windows sign in was recorded.'],
    4634: ['Windows Sign Out', 'Windows sign out was recorded.'],
    4778: ['Session Connect', 'Windows session connected.'],
    4779: ['Session Disconnect', 'Windows session disconnected.'],
  };

  list
    .sort((a, b) => Number(a.RecordId || 0) - Number(b.RecordId || 0))
    .forEach((row) => {
      const key = `${row.LogName}:${row.Id}`;
      const recordId = Number(row.RecordId || 0);
      if (recordId <= Number(state.eventLogRecords[key] || 0)) return;
      let [eventName, meaning] = names[row.Id] || ['Active Usage', 'Windows event captured.'];
      if (Number(row.Id) === 1074) {
        const message = String(row.Message || '').toLowerCase();
        eventName = message.includes('restart') || message.includes('reboot') ? 'Restart' : 'Shutdown';
        meaning = eventName === 'Restart' ? 'Windows restart was initiated.' : 'Windows shutdown was initiated.';
      }
      events.push(baseEvent(eventName, meaning, {
        occurredAt: row.TimeCreated,
        eventId: row.Id,
        sourceLog: row.LogName,
        provider: row.ProviderName,
        recordNumber: recordId,
        message: String(row.Message || '').slice(0, 2000),
        unique: `${row.LogName}:${recordId}:${row.Id}`,
        externalId: `${config.agentId}:${row.LogName}:${recordId}:${row.Id}`,
      }));
      state.eventLogRecords[key] = Math.max(Number(state.eventLogRecords[key] || 0), recordId);
    });

  return events;
}

async function collectActiveWindow(state) {
  const script = `
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Window {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
    $handle = [Win32Window]::GetForegroundWindow()
    $builder = New-Object System.Text.StringBuilder 1024
    [void][Win32Window]::GetWindowText($handle, $builder, $builder.Capacity)
    [uint32]$pid = 0
    [void][Win32Window]::GetWindowThreadProcessId($handle, [ref]$pid)
    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
    [pscustomobject]@{ ProcessId = $pid; ProcessName = $process.ProcessName; Title = $builder.ToString() }
  `;
  const row = await json(script, null);
  if (!row || !row.ProcessName) return [];
  const key = `${row.ProcessName}:${row.Title}`;
  if (state.activeWindow === key) return [];
  const previous = state.activeWindow;
  state.activeWindow = key;
  const metadata = {
    processId: row.ProcessId,
    processName: row.ProcessName,
    windowTitle: row.Title,
    previousWindow: previous,
    application: row.ProcessName,
  };
  const events = [
    baseEvent('Application Switch', 'Foreground application changed.', {
      status: 'Active',
      metadata,
      unique: `window:${key}:${Date.now()}`,
    }),
    baseEvent('Active Application', 'Foreground application usage captured.', {
      status: 'Active',
      metadata,
      unique: `active-app:${key}:${Date.now()}`,
    }),
  ];
  if (BROWSER_PROCESSES.has(String(row.ProcessName).toLowerCase())) {
    events.push(baseEvent('Website Visited', 'Supported browser foreground tab/window captured.', {
      status: 'Active',
      metadata: { ...metadata, browser: row.ProcessName, websiteTitle: row.Title },
      unique: `browser:${key}:${Date.now()}`,
    }));
  }
  return events;
}

async function collectProcesses(state) {
  const rows = await json('Get-Process | Select-Object Id,ProcessName,StartTime -ErrorAction SilentlyContinue', []);
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const current = {};
  const events = [];
  list.forEach((row) => {
    const key = String(row.Id);
    current[key] = { name: row.ProcessName, startedAt: row.StartTime };
    if (!state.processes[key]) {
      events.push(baseEvent('Application Started', 'Windows process started.', {
        status: 'Started',
        metadata: { processId: row.Id, processName: row.ProcessName, startedAt: row.StartTime },
        unique: `process-start:${row.Id}:${row.StartTime || Date.now()}`,
      }));
    }
  });
  Object.entries(state.processes || {}).forEach(([pid, row]) => {
    if (current[pid]) return;
    events.push(baseEvent('Application Stopped', 'Windows process stopped.', {
      status: 'Stopped',
      metadata: { processId: pid, processName: row.name, startedAt: row.startedAt },
      unique: `process-stop:${pid}:${Date.now()}`,
    }));
  });
  state.processes = current;
  return events;
}

async function collectIdle(state) {
  const script = `
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IdleTime {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();
  public static uint GetIdleMilliseconds() {
    LASTINPUTINFO info = new LASTINPUTINFO();
    info.cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf(info);
    GetLastInputInfo(ref info);
    return GetTickCount() - info.dwTime;
  }
}
"@
    [pscustomobject]@{ IdleMs = [IdleTime]::GetIdleMilliseconds() }
  `;
  const row = await json(script, { IdleMs: 0 });
  const idleMs = Number(row.IdleMs || 0);
  const now = Date.now();
  const elapsed = Math.max(now - Number(state.lastIdleSampleAt || now), 0);
  state.lastIdleSampleAt = now;
  const isIdle = idleMs >= config.idleThresholdMs;
  const events = [
    baseEvent(isIdle ? 'Idle Time' : 'Active Usage', isIdle ? 'No keyboard or mouse input detected.' : 'Keyboard or mouse activity detected.', {
      durationMs: elapsed,
      status: isIdle ? 'Idle' : 'Active',
      metadata: { idleMs },
      unique: `idle-sample:${Math.floor(now / config.pollIntervalMs)}`,
    }),
  ];
  if (state.idle !== isIdle) {
    events.push(baseEvent(isIdle ? 'Idle State' : 'Active State', isIdle ? 'Windows session became idle.' : 'Windows session became active.', {
      status: isIdle ? 'Idle' : 'Active',
      metadata: { idleMs },
      unique: `idle-state:${isIdle}:${now}`,
    }));
  }
  state.idle = isIdle;
  state.lastActivityAt = isIdle ? state.lastActivityAt : new Date().toISOString();
  return events;
}

function collectNetwork(state) {
  const online = Object.values(os.networkInterfaces()).flat().some((net) => net && !net.internal && net.address);
  if (state.networkOnline === online) return [];
  state.networkOnline = online;
  return [baseEvent(online ? 'Network Online' : 'Network Offline', online ? 'Network interface is online.' : 'No active network interface detected.', {
    status: online ? 'Online' : 'Offline',
    metadata: { interfaces: Object.keys(os.networkInterfaces()) },
    unique: `network:${online}:${Date.now()}`,
  })];
}

function collectSystemVitals(state) {
  const bootMs = Date.now() - os.uptime() * 1000;
  const bootKey = String(Math.floor(bootMs / 1000));
  const events = [];
  if (state.bootKey !== bootKey) {
    state.bootKey = bootKey;
    events.push(baseEvent('System Boot Time', 'System boot time captured.', {
      occurredAt: new Date(bootMs),
      status: 'Online',
      metadata: { uptimeSeconds: os.uptime() },
      unique: `boot:${bootKey}`,
    }));
  }
  events.push(baseEvent('System Uptime', 'System uptime sampled.', {
    durationMs: os.uptime() * 1000,
    status: 'Online',
    metadata: { uptimeSeconds: os.uptime(), lastActivityAt: state.lastActivityAt || null },
    unique: `uptime:${Math.floor(Date.now() / 60000)}`,
  }));
  return events;
}

module.exports = {
  baseEvent,
  collectActiveWindow,
  collectEventLogEvents,
  collectIdle,
  collectNetwork,
  collectProcesses,
  collectSystemVitals,
};
