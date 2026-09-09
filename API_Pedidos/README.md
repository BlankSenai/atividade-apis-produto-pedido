# API de Pedidos

API REST para cadastro de pedidos, construída com **Node.js + Express + SQLite**.  
Orquestra comunicação com a **API de Produtos (Python)** para verificar disponibilidade e debitar estoque antes de confirmar um pedido.

## Pré-requisitos

- Node.js LTS (v18+)
- API de Produtos rodando (por padrão em `http://localhost:8000`)

## Instalação

```bash
npm install
```

## Configuração

Copie o `.env.example` para `.env` e ajuste se necessário:

```bash
cp .env.example .env
```

Variáveis disponíveis:

| Variável           | Padrão                   | Descrição                          |
|--------------------|--------------------------|------------------------------------|
| `PORT`             | `4000`                   | Porta do servidor                  |
| `PRODUCTS_API_URL` | `http://localhost:8000`  | URL base da API de Produtos        |
| `DATABASE_FILE`    | `./pedidos.db`           | Caminho do arquivo SQLite          |

## Execução

```bash
# Desenvolvimento (com hot-reload)
npm run dev

# Produção
npm start
```

A API estará disponível em `http://localhost:4000`.

## Endpoints

| Método   | Rota             | Descrição                                  |
|----------|------------------|--------------------------------------------|
| `GET`    | `/`              | Health check                               |
| `POST`   | `/pedidos`       | Cria pedido (orquestra com API de Produtos) |
| `GET`    | `/pedidos`       | Lista pedidos (paginação e filtro)         |
| `GET`    | `/pedidos/:id`   | Busca pedido por ID                        |
| `PUT`    | `/pedidos/:id`   | Atualiza status (ex.: cancelar)            |
| `DELETE` | `/pedidos/:id`   | Remove pedido                              |

### Criar pedido — `POST /pedidos`

```json
{ "produto_id": 1, "quantidade": 3 }
```

### Listar pedidos — `GET /pedidos`

Query params opcionais: `?page=1&limit=10&status=confirmado`

### Cancelar pedido — `PUT /pedidos/:id`

```json
{ "status": "cancelado" }
```

O cancelamento **devolve o estoque** na API de Produtos
(`POST /produtos/:id/estoque/reposicao`). Reenviar `cancelado` em um pedido já
cancelado não devolve de novo. Reativar (`{"status": "confirmado"}`) debita o
estoque outra vez e pode responder `409` se as unidades já tiverem sido
consumidas por outro pedido.

Se a API de Produtos estiver fora do ar, o cancelamento é recusado com `503` e
o pedido continua `confirmado` — é preferível recusar a operação a perder as
unidades no estoque.

### Remover pedido — `DELETE /pedidos/:id`

Se o pedido ainda estava `confirmado`, o estoque é devolvido antes de apagar.
Um pedido já cancelado apenas é removido (o estoque já voltou no cancelamento).

## Fluxo de criação de pedido

1. Valida body (`produto_id` obrigatório, `quantidade` > 0)
2. Busca dados do produto na API de Produtos
3. Verifica estoque disponível
4. Debita estoque (operação atômica na API de Produtos)
5. Salva pedido localmente com status `confirmado`
6. Retorna `201` com o pedido criado

## Fluxo de cancelamento

1. Busca o pedido local (404 se não existir)
2. Se estava `confirmado`, devolve a quantidade via
   `POST /produtos/:id/estoque/reposicao`
3. Só então grava o novo status (se o passo 2 falhar, nada muda e retorna `503`)

## Testes

Use o arquivo `requests.http` (extensão REST Client no VS Code) ou importe no Postman.

## Estrutura do projeto

```
├── src/
│   ├── server.js                  # Start do servidor
│   ├── app.js                     # Express, middlewares, rotas
│   ├── db.js                      # Conexão SQLite + criação da tabela
│   ├── routes/
│   │   └── pedidos.routes.js      # Definição das rotas
│   ├── controllers/
│   │   └── pedidos.controller.js  # Lógica dos endpoints
│   └── services/
│       └── produtosClient.js      # Client HTTP para API de Produtos
├── .env
├── .env.example
├── package.json
├── requests.http
└── README.md
```
