# Catálogo de Itens de RPG — API RESTful com SQLite

Disciplina de Desenvolvimento de Sistemas Web — Desafio Prático em Dupla

* **Estudantes:** Thiago Borsatto e Douglas Nolli

## Objetivo do Projeto

Construir do zero uma API RESTful para gerenciar o catálogo de itens/equipamentos de um jogo de
RPG, aplicando persistência relacional síncrona com `better-sqlite3`, arquitetura REST, tratamento
rigoroso de dados (validação e sanitização) e segurança contra SQL Injection.

## Estrutura do Projeto

```
Catalogo_Itens_RPG/
├── database.ts       
├── server.ts         
├── request.http      
├── package.json      
├── tsconfig.json     
└── .gitignore        
```

## Como executar

```bash
# 1. Instalar as dependências
npm install

# 2. Subir o servidor (o banco e as tabelas são criados automaticamente)
npm run dev
```

O servidor sobe em `http://localhost:3000` e o arquivo `dados.db` é criado na raiz na primeira
execução, ele está no `.gitignore`, então cada integrante da dupla tem o seu banco local.

Para testar, abra o `request.http` com a extensão **REST Client** do VS Code / Codespaces e clique
em *Send Request* em cada bloco separado por `###`.

## Entidade: `itens`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | Chave primária autoincrementada |
| `nome` | TEXT | Nome do item (obrigatório) |
| `tipo` | TEXT | `espada`, `escudo` ou `poção` |
| `raridade` | TEXT | `comum`, `raro` ou `lendário` (padrão: `comum`) |
| `poder_ataque` | INTEGER | Número inteiro maior que zero |
| `criado_em` | DATETIME | Preenchido automaticamente pelo banco |

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Rota de fallback |
| GET | `/api/health` | Verifica se o servidor está ativo |
| GET | `/api/version` | Nome e versão da aplicação |
| GET | `/api/itens` | Lista todos os itens; `?search=texto` filtra pelo nome com `LIKE` |
| GET | `/api/itens/:id` | Busca um item específico |
| POST | `/api/itens` | Cria um item — retorna **201 Created** com o objeto criado |
| PUT | `/api/itens/:id` | Atualização total do item |
| PATCH | `/api/itens/:id` | Atualização parcial dinâmica dentro de uma transação |
| DELETE | `/api/itens/:id` | Remove o item do banco |

## Regras de Negócio e Validação

* **`nome`**: obrigatório. É sanitizado com `.trim()` **antes** da checagem, então um nome só com
  espaços é rejeitado com **400**.
* **`poder_ataque`**: precisa ser um número inteiro válido e **maior que zero**. Texto, zero ou
  negativo retornam **400**.
* **`tipo`**: obrigatório e restrito à lista `espada`, `escudo`, `poção`. Fora da lista retorna
  **400**.
* **`raridade`**: se vier ausente ou inválida, a API **não quebra** — assume o valor padrão
  `comum`.
* **`:id` na URL**: precisa ser um inteiro positivo. Texto (ex: `/api/itens/abc`) retorna **400**;
  um ID que não existe retorna **404**.
* **JSON malformado**: interceptado por um middleware de erro do parser, respondendo **400** em vez
  de derrubar o servidor.

## Segurança contra SQL Injection

Todas as queries usam **Prepared Statements** (`?`) do `better-sqlite3`. Não existe uma única
concatenação de variável dentro de string SQL no projeto.

No `PATCH`, onde a query é montada dinamicamente, apenas os **nomes das colunas** entram na string —
e eles vêm de literais fixos escritos no código (`"nome = ?"`, `"tipo = ?"`, ...), nunca da
requisição. Os valores enviados pelo usuário sempre passam por `?`.

Para comprovar isso, o banco tem uma tabela isca `usuarios` com credenciais falsas e o
`request.http` traz **15 ataques reais** na seção final, cobrindo todas as rotas do CRUD:

* **Leitura** (`GET ?search=`): `UNION SELECT` tentando vazar a tabela `usuarios`, `DROP TABLE` e a
  tautologia `' OR '1'='1` — todos retornam **200 com lista vazia**, sem vazar nada.
* **Escrita** (`POST`, `PUT`, `PATCH`): SQL enviado dentro dos valores é gravado como **texto
  literal**, sem executar. O ataque que injeta `poder_ataque = 99999` pelo campo `nome` não altera o
  poder do item.
* **Nome de campo malicioso no `PATCH`**: como o `SET` só aceita colunas de uma lista fixa, a chave
  maliciosa é rejeitada com **400**.
* **IDs na URL** (`GET`, `PUT`, `DELETE`): `1 OR 1=1` e `1; DROP TABLE itens` são barrados com
  **400** antes de chegarem ao banco.

Ao final da bateria, as duas tabelas continuam existindo e os dados permanecem intactos.
