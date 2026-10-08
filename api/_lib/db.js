// One MongoDB connection per serverless instance, reused across requests.
const { MongoClient } = require('mongodb');

let clientPromise = null;
let indexesReady = null;

function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
      .connect()
      .catch(err => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

async function getDb() {
  const client = await getClient();
  const db = client.db(process.env.MONGODB_DB || 'khandelwalPerfume');
  if (!indexesReady) {
    indexesReady = Promise.all([
      // failed logins expire after 15 minutes
      db.collection('login_attempts').createIndex({ at: 1 }, { expireAfterSeconds: 15 * 60 }),
      db.collection('login_attempts').createIndex({ ip: 1 }),
      db.collection('images').createIndex({ createdAt: 1 })
    ]).catch(err => { indexesReady = null; throw err; });
  }
  await indexesReady;
  return db;
}

module.exports = { getDb };
