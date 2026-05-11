const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI is not set. Add it to server/.env');
  process.exit(1);
}

(async () => {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    // Simple ping to verify connectivity
    const res = await client.db().admin().ping();
    console.log('Connected to MongoDB. Ping response:', res);
    process.exit(0);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(2);
  } finally {
    try { await client.close(); } catch (_) {}
  }
})();
