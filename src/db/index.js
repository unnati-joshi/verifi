const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

function open(dbPath = config.dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  // WAL lets readers and the writer work concurrently instead of blocking each other.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return db;
}

let instance;

module.exports = {
  open,
  get db() {
    if (!instance) instance = open(config.isTest ? ':memory:' : config.dbPath);
    return instance;
  },
  close() {
    if (instance) instance.close();
    instance = undefined;
  },
};
