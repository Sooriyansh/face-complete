const fs = require('fs');
const path = require('path');
const config = require('./config');

function write(level, message, details) {
  const line = JSON.stringify({
    level,
    message,
    details: details instanceof Error ? { message: details.message, stack: details.stack } : details,
    at: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
  fs.appendFileSync(config.logFile, `${line}\n`);
  if (level === 'error') console.error(message);
  else console.log(message);
}

module.exports = {
  info: (message, details) => write('info', message, details),
  warn: (message, details) => write('warn', message, details),
  error: (message, details) => write('error', message, details),
};
