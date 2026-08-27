import Database from "better-sqlite3";
import path from "path";

const dbPath = path.resolve(import.meta.dirname, "dados.db");
const db = new Database(dbPath);

// Configura o banco para operação síncrona otimizada (Modo WAL)
db.pragma("journal_mode = WAL");

export function inicializarBanco(): void {
    const query = `
        CREATE TABLE IF NOT EXISTS itens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            tipo TEXT NOT NULL,
            raridade TEXT NOT NULL DEFAULT 'comum',
            poder_ataque INTEGER NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            senha TEXT NOT NULL
        );
    `;

    db.exec(query);

    const usuariosExistentes = db
        .prepare("SELECT COUNT(*) AS count FROM usuarios")
        .get() as { count: number };

    if (usuariosExistentes.count === 0) {
        db.prepare("INSERT INTO usuarios (email, senha) VALUES (?, ?)").run(
            "admin@senai.com",
            "senha_super_segura_123"
        );
    }

    console.log("Banco de dados inicializado e tabelas prontas para uso!");
}

export default db;
