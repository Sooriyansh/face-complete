require('./config/testingEnv').applyTestingEnvDefaults();

const express = require('express');
const http = require('http');
const path = require('path');

const { connectDatabase } = require('./config/database');
const { attachCurrentUser } = require('./middleware/auth');
const { defaultViewLocals } = require('./middleware/locals');
const { errorHandler } = require('./middleware/errorHandler');
const { registerRoutes } = require('./routes');
const { initializeNotificationJobs } = require('./services/notificationScheduler');
const { getWorkerProcess } = require('./services/faceRecognition');
const { initializeSockets } = require('./sockets');

const app = express();
const PORT = process.env.PORT || 8080;

app.set('view engine', 'ejs');
app.set('views', [
  path.join(__dirname, 'admin', 'views'),
  path.join(__dirname, 'emp', 'views'),
  path.join(__dirname, 'views'),
]);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(attachCurrentUser);
app.use(defaultViewLocals);

registerRoutes(app);

app.use(errorHandler);

const server = http.createServer(app);
initializeSockets(server, app);
initializeNotificationJobs();

connectDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port http://localhost:${PORT}`);
      getWorkerProcess()
        .then(() => console.log('Face recognition worker warmed up'))
        .catch((error) => console.warn('Face recognition warmup skipped:', error.message));
    });
  })
  .catch(() => {
    process.exitCode = 1;
  });
