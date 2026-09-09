const Database = require('better-sqlite3');
const path = require('path');

const dbFile = process.env.DATABASE_FILE || './pedidos.db';
const dbPath = path.resolve(dbFile);

const db = new Database(dbPath);

// Habilita WAL para melhor performance em concorrência
db.pragma('journal_mode = WAL');

// Criação da tabela pedidos no startup
db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id      INTEGER NOT NULL,
    produto_nome    TEXT    NOT NULL,
    quantidade      INTEGER NOT NULL CHECK(quantidade > 0),
    preco_unitario  REAL    NOT NULL,
    valor_total     REAL    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'confirmado',
    criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

module.exports = db;
