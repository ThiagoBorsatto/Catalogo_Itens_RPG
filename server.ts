import express from "express";
import type { NextFunction, Request, Response } from "express";
import db, { inicializarBanco } from "./database.ts";

const app = express();
const PORT = 3000;

// Middleware para ler o corpo das requisições em formato JSON
app.use(express.json());

// Middleware de erro do parser: evita que um JSON malformado derrube o servidor
app.use((erro: Error, req: Request, res: Response, next: NextFunction) => {
    if (erro instanceof SyntaxError && "body" in erro) {
        return res.status(400).json({ error: "O corpo da requisição não é um JSON válido." });
    }
    return next(erro);
});

// Inicializa o banco de dados automaticamente antes das rotas
inicializarBanco();

// Listas fixas de valores aceitos pelo catálogo
const TIPOS_VALIDOS = ["espada", "escudo", "poção"];
const RARIDADES_VALIDAS = ["comum", "raro", "lendário"];

// ============================================================
// VALIDAÇÃO E SANITIZAÇÃO
// ============================================================

// O nome é obrigatório e não pode ficar vazio depois do .trim()
function validarNome(nome: unknown): string | null {
    if (typeof nome !== "string") return null;
    const nomeLimpo = nome.trim();
    return nomeLimpo.length === 0 ? null : nomeLimpo;
}

// O tipo precisa estar na lista fixa (espada, escudo, poção)
function validarTipo(tipo: unknown): string | null {
    if (typeof tipo !== "string") return null;
    const tipoLimpo = tipo.trim().toLowerCase();
    return TIPOS_VALIDOS.includes(tipoLimpo) ? tipoLimpo : null;
}

// Raridade ausente ou fora da lista cai no valor padrão "comum"
function normalizarRaridade(raridade: unknown): string {
    if (typeof raridade !== "string") return "comum";
    const raridadeLimpa = raridade.trim().toLowerCase();
    return RARIDADES_VALIDAS.includes(raridadeLimpa) ? raridadeLimpa : "comum";
}

// O poder de ataque deve ser um número inteiro válido e maior que zero
function validarPoderAtaque(valor: unknown): number | null {
    if (typeof valor !== "number" && typeof valor !== "string") return null;
    if (typeof valor === "string" && valor.trim().length === 0) return null;
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// O ID recebido na URL precisa ser um número inteiro positivo
function validarId(id: string): number | null {
    const idNumerico = Number(id);
    return Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null;
}

// Mensagens de erro reaproveitadas por POST, PUT e PATCH
const ERRO_NOME = "O nome do item é obrigatório e não pode ser vazio.";
const ERRO_TIPO = `O tipo é obrigatório e deve ser um destes: ${TIPOS_VALIDOS.join(", ")}.`;
const ERRO_PODER = "O poder_ataque deve ser um número inteiro válido e maior que zero.";
const ERRO_ID = "ID inválido. Informe um número inteiro positivo.";

// ============================================================
// ROTAS DE DIAGNÓSTICO
// ============================================================

// Rota principal de FALLBACK
app.get("/", (req, res) => {
    res.json({ turma: "ADS-2025" });
});

// Rota de integridade do sistema (Health Check)
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Servidor do Catálogo de Itens de RPG ativo!" });
});

// Rota da versão do sistema (Version Check)
app.get("/api/version", (req, res) => {
    res.json({ appName: "Catálogo de Itens de RPG", version: "1.0.0" });
});

// ============================================================
// CRUD DE ITENS
// ============================================================

// READ: lista todos os itens ou filtra pelo nome usando ?search=
app.get("/api/itens", (req, res) => {
    const { search } = req.query;
    try {
        if (search) {
            // Prepared Statement: o '?' protege contra Injeção de SQL.
            const sql = "SELECT * FROM itens WHERE nome LIKE ? ORDER BY id";
            const itens = db.prepare(sql).all(`%${search}%`);
            return res.status(200).json(itens);
        }

        const itens = db.prepare("SELECT * FROM itens ORDER BY id").all();
        return res.status(200).json(itens);
    } catch (erro) {
        return res.status(500).json({ error: "Erro ao consultar o catálogo de itens." });
    }
});

// READ: busca um único item pelo ID
app.get("/api/itens/:id", (req, res) => {
    const id = validarId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: ERRO_ID });
    }

    try {
        const item = db.prepare("SELECT * FROM itens WHERE id = ?").get(id);

        if (!item) {
            return res.status(404).json({ error: "Item não encontrado no catálogo." });
        }

        return res.status(200).json(item);
    } catch (erro) {
        return res.status(500).json({ error: "Erro ao consultar o item no banco de dados." });
    }
});

// CREATE: cadastra um novo item no catálogo
app.post("/api/itens", (req, res) => {
    const { nome, tipo, raridade, poder_ataque } = req.body ?? {};

    // Sanitizamos com .trim() ANTES de checar o conteúdo, aplicando a regra de negócio
    const nomeValido = validarNome(nome);
    if (nomeValido === null) {
        return res.status(400).json({ error: ERRO_NOME });
    }

    const tipoValido = validarTipo(tipo);
    if (tipoValido === null) {
        return res.status(400).json({ error: ERRO_TIPO });
    }

    const poderValido = validarPoderAtaque(poder_ataque);
    if (poderValido === null) {
        return res.status(400).json({ error: ERRO_PODER });
    }

    // Raridade inválida não quebra a requisição: assume o padrão "comum"
    const raridadeValida = normalizarRaridade(raridade);

    try {
        const sql = "INSERT INTO itens (nome, tipo, raridade, poder_ataque) VALUES (?, ?, ?, ?)";
        const resultado = db.prepare(sql).run(nomeValido, tipoValido, raridadeValida, poderValido);

        // Retorna o objeto recém-criado usando o ID gerado (lastInsertRowid)
        const novoItem = db
            .prepare("SELECT * FROM itens WHERE id = ?")
            .get(resultado.lastInsertRowid);

        return res.status(201).json(novoItem);
    } catch (erro) {
        return res.status(500).json({ error: "Erro ao processar a persistência do item." });
    }
});

// UPDATE TOTAL: substitui todos os campos de um item existente
app.put("/api/itens/:id", (req, res) => {
    // 1. Validação do ID numérico recebido na URL
    const id = validarId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: ERRO_ID });
    }

    const { nome, tipo, raridade, poder_ataque } = req.body ?? {};

    // 2. Todos os campos obrigatórios passam pelas mesmas regras do POST
    const nomeValido = validarNome(nome);
    if (nomeValido === null) {
        return res.status(400).json({ error: ERRO_NOME });
    }

    const tipoValido = validarTipo(tipo);
    if (tipoValido === null) {
        return res.status(400).json({ error: ERRO_TIPO });
    }

    const poderValido = validarPoderAtaque(poder_ataque);
    if (poderValido === null) {
        return res.status(400).json({ error: ERRO_PODER });
    }

    // 3. Sanitização com valor padrão para a raridade
    const raridadeValida = normalizarRaridade(raridade);

    try {
        // 4. UPDATE utilizando Prepared Statement (?) para segurança
        const sql =
            "UPDATE itens SET nome = ?, tipo = ?, raridade = ?, poder_ataque = ? WHERE id = ?";
        const resultado = db
            .prepare(sql)
            .run(nomeValido, tipoValido, raridadeValida, poderValido, id);

        // 5. Verifica se alguma linha foi de fato modificada no banco
        if (resultado.changes === 0) {
            return res.status(404).json({ error: "Item não encontrado para atualização." });
        }

        // 6. Busca o item recém-atualizado para retornar no corpo da resposta (Princípio REST)
        const itemAtualizado = db.prepare("SELECT * FROM itens WHERE id = ?").get(id);
        return res.status(200).json(itemAtualizado);
    } catch (erro) {
        return res.status(500).json({ error: "Erro ao processar a atualização no banco de dados." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em: http://localhost:${PORT}`);
});
