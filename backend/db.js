// Lightweight data layer.
// - Uses MongoDB when MONGODB_URI is provided.
// - Falls back to an in-memory store so the service works on free deploys
//   where running a Mongo daemon isn't possible. Data is still protected
//   behind the same JWT auth layer.
const { MongoClient } = require('mongodb');

const COLLECTION = 'submissions';

let client = null;
let collection = null;
const memoryStore = [];
let mode = 'memory';

async function connect(uri) {
  if (!uri) {
    console.log('[db] No MONGODB_URI provided — using in-memory store.');
    mode = 'memory';
    return;
  }
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    const db = client.db();
    collection = db.collection(COLLECTION);
    // Index for fast filtering
    await collection.createIndex({ name: 1 });
    await collection.createIndex({ createdAt: -1 });
    mode = 'mongo';
    console.log('[db] Connected to MongoDB.');
  } catch (err) {
    console.error('[db] MongoDB connection failed, falling back to in-memory store:', err.message);
    mode = 'memory';
  }
}

function ensureId(doc) {
  if (!doc) return doc;
  return { ...doc, id: doc.id || doc._id?.toString() };
}

async function insertSubmission(doc) {
  if (mode === 'mongo') {
    const res = await collection.insertOne(doc);
    return { ...doc, _id: res.insertedId, id: res.insertedId.toString() };
  }
  const id = (memoryStore.length + 1).toString();
  const stored = { ...doc, id };
  memoryStore.unshift(stored);
  return stored;
}

async function listSubmissions({ page = 1, limit = 10, search = '', sort = 'newest' } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (safePage - 1) * safeLimit;

  let docs = [];
  let total = 0;

  if (mode === 'mongo') {
    const filter = {};
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: re },
        { 'weather.summary': re },
        { 'weather.temperature': re },
        { ip: re },
      ];
    }
    const sortSpec = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };
    total = await collection.countDocuments(filter);
    const cursor = collection.find(filter).sort(sortSpec).skip(skip).limit(safeLimit);
    docs = await cursor.toArray();
  } else {
    let arr = [...memoryStore];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.weather?.summary || '').toLowerCase().includes(q) ||
        (d.ip || '').toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => sort === 'oldest'
      ? new Date(a.createdAt) - new Date(b.createdAt)
      : new Date(b.createdAt) - new Date(a.createdAt));
    total = arr.length;
    docs = arr.slice(skip, skip + safeLimit);
  }

  return {
    items: docs.map(ensureId).map(d => ({
      id: d.id,
      name: d.name,
      latitude: d.latitude,
      longitude: d.longitude,
      weather: d.weather,
      ip: d.ip,
      userAgent: d.userAgent,
      referer: d.referer,
      consent: d.consent,
      createdAt: d.createdAt,
    })),
    total,
    page: safePage,
    pages: Math.max(1, Math.ceil(total / safeLimit)),
    limit: safeLimit,
  };
}

async function deleteSubmission(id) {
  if (mode === 'mongo') {
    const { ObjectId } = require('mongodb');
    let _id;
    try { _id = new ObjectId(id); } catch { return false; }
    const res = await collection.deleteOne({ _id });
    return res.deletedCount > 0;
  }
  const idx = memoryStore.findIndex(d => d.id === id);
  if (idx === -1) return false;
  memoryStore.splice(idx, 1);
  return true;
}

async function getAllForExport() {
  if (mode === 'mongo') {
    const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(ensureId);
  }
  return [...memoryStore].map(ensureId);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMode() { return mode; }

module.exports = {
  connect,
  insertSubmission,
  listSubmissions,
  deleteSubmission,
  getAllForExport,
  getMode,
};
