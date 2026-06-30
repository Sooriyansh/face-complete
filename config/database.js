const mongoose = require('mongoose');

const DEFAULT_LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/faceAttendance';

function getMongoUri() {
  return process.env.MONGO_URI || DEFAULT_LOCAL_MONGO_URI;
}

function explainMongoConnectionError(error, mongoUri = getMongoUri()) {
  const message = String(error?.message || '');
  const hostname = error?.cause?.hostname || message.match(/ENOTFOUND\s+([^\s]+)/)?.[1] || '';
  const usingAtlas = /^mongodb\+srv:\/\//i.test(mongoUri) || /mongodb\.net/i.test(mongoUri);

  if (message.includes('ENOTFOUND') || error?.code === 'ENOTFOUND') {
    return [
      `MongoDB DNS lookup failed${hostname ? ` for ${hostname}` : ''}.`,
      usingAtlas
        ? 'Your Atlas hostname cannot be resolved from this machine. Check internet/DNS, Atlas URI, and network/firewall settings.'
        : 'Check that MongoDB is running locally and MONGO_URI points to the correct host.',
    ].join(' ');
  }

  if (message.includes('ReplicaSetNoPrimary')) {
    return 'MongoDB Atlas was reached but no primary node was selectable. Check network access, DNS, cluster health, and IP allowlist.';
  }

  return error?.message || 'MongoDB connection failed.';
}

async function connectDatabase() {
  const mongoUri = getMongoUri();
  mongoose.set('bufferCommands', false);

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
    });
    console.log('MongoDB connected');
  } catch (error) {
    const explanation = explainMongoConnectionError(error, mongoUri);
    console.error(`MongoDB connection error: ${explanation}`);
    console.error(`Set MONGO_URI in .env. For local development use: ${DEFAULT_LOCAL_MONGO_URI}`);
    if (process.env.MONGO_REQUIRED !== 'false') {
      throw error;
    }
  }
}

module.exports = {
  DEFAULT_LOCAL_MONGO_URI,
  connectDatabase,
  explainMongoConnectionError,
  getMongoUri,
};
