const { execFile } = require('child_process');

function runPowerShell(script, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5 },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

async function json(script, fallback = null, timeoutMs) {
  const output = await runPowerShell(`$__faceAiResult = & { ${script} }; $__faceAiResult | ConvertTo-Json -Depth 8 -Compress`, timeoutMs);
  if (!output) return fallback;
  return JSON.parse(output);
}

module.exports = { json, runPowerShell };
