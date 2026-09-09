# API de Produtos

API de cadastro de produtos e controle de estoque, escrita em **Python + FastAPI**.
É consumida internamente pela **API de Pedidos (Node/Express)** durante a criação
de um pedido, para verificar disponibilidade e debitar quantidade em estoque.

```
API Pedidos (Node/Express)  --consulta produto/estoque-->  API Produtos (Python)
                            --debita estoque----------->   -> SQLite
```

## Stack

- Python 3.11+ (testado em 3.14)
- FastAPI + Uvicorn
- SQLModel (SQLAlchemy + Pydantic)
- SQLite (`produtos.db`)
- python-dotenv

## Instalação

```bash
# 1. criar e ativar o ambiente virtual
py -m venv .venv
.venv\Scripts\activate         # Windows (PowerShell/CMD)
source .venv/bin/activate      # Linux/macOS

# 2. instalar dependências
pip install -r requirements.txt

# 3. copiar as variáveis de ambiente
copy .env.example .env         # Windows
cp .env.example .env           # Linux/macOS
```

`.env`:

```
PORT=8000
DATABASE_URL=sqlite:///./produtos.db
```

## Execução

```bash
# opção 1 - respeita a PORT do .env
python -m app.main

# opção 2 - direto pelo uvicorn
uvicorn app.main:app --reload --port 8000
```

As tabelas são criadas automaticamente no startup.

- API: http://localhost:8000
- Documentação interativa (Swagger): http://localhost:8000/docs

### Popular o banco com dados de teste

```bash
python seed.py           # insere 6 produtos (não duplica)
python seed.py --reset   # limpa a tabela e insere de novo
```

## Estrutura

```
api_produtos/
├── app/
│   ├── main.py            # instância do FastAPI, handlers de erro, health check
│   ├── database.py        # engine, sessão, criação das tabelas
│   ├── models.py          # modelo SQLModel: Produto
│   ├── schemas.py         # ProdutoCreate, ProdutoUpdate, ProdutoOut, estoque
│   └── routers/
│       └── produtos.py    # todas as rotas /produtos
├── seed.py                # popula o banco com produtos de teste
├── requests.http          # coleção de testes de todos os endpoints
├── requirements.txt
├── .env / .env.example
└── produtos.db            # gerado em runtime
```

## Modelo de dados — tabela `produtos`

| Campo              | Tipo     | Regras                                  |
|--------------------|----------|-----------------------------------------|
| id                 | integer  | PK autoincrement                        |
| nome               | string   | obrigatório, não vazio                  |
| descricao          | string   | opcional                                |
| preco              | float    | obrigatório, > 0                        |
| categoria          | string   | opcional (filtro na listagem)           |
| quantidade_estoque | integer  | obrigatório, >= 0, default 0            |
| criado_em          | datetime | default `now()` (UTC)                   |

## Endpoints

### CRUD

| Método | Rota | Descrição | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/produtos` | Cria produto | 201 | 400 |
| GET | `/produtos` | Lista paginada com filtros | 200 | 400 |
| GET | `/produtos/{id}` | Busca por id | 200 | 404 |
| PUT | `/produtos/{id}` | Atualiza nome/descrição/preço/categoria | 200 | 400, 404 |
| DELETE | `/produtos/{id}` | Remove produto | 204 | 404 |

O `PUT` **não** altera `quantidade_estoque` — campos desconhecidos no body são
ignorados. Estoque só muda pelo endpoint dedicado, para manter rastreabilidade.
Os campos do `PUT` são opcionais (atualização parcial); enviar um body sem
nenhum campo válido retorna 400.

### Listagem paginada com filtro

`GET /produtos?page=1&limit=10&nome=abc&categoria=eletronicos`

- `page` — default 1 (mínimo 1)
- `limit` — default 10 (mínimo 1, máximo 100)
- `nome` — busca parcial, case-insensitive (LIKE)
- `categoria` — match exato

```json
{
  "data": [
    { "id": 1, "nome": "Produto X", "descricao": null, "preco": 29.9,
      "categoria": "Eletrônicos", "quantidade_estoque": 15,
      "criado_em": "2025-01-01T12:00:00" }
  ],
  "pagination": { "page": 1, "limit": 10, "total_itens": 42, "total_paginas": 5 }
}
```

### Estoque — contrato de integração com a API de Pedidos

**Consultar estoque** — `GET /produtos/{id}/estoque`

```json
{ "produto_id": 1, "quantidade_disponivel": 15 }
```

- 404 → produto não encontrado

**Diminuir estoque** — `POST /produtos/{id}/estoque/baixa`

Body:
```json
{ "quantidade": 3 }
```

- 200:
```json
{ "produto_id": 1, "quantidade_anterior": 15, "quantidade_atual": 12 }
```
- 400 → `quantidade` ausente ou <= 0
- 404 → produto não encontrado
- 409 → estoque insuficiente:
```json
{ "erro": "Estoque insuficiente", "quantidade_disponivel": 2, "quantidade_solicitada": 3 }
```

**Repor estoque (estorno)** — `POST /produtos/{id}/estoque/reposicao`

Operação inversa da baixa, usada pela API de Pedidos quando um pedido é
cancelado ou removido.

Body:
```json
{ "quantidade": 3 }
```

- 200:
```json
{ "produto_id": 1, "quantidade_anterior": 12, "quantidade_atual": 15 }
```
- 400 → `quantidade` ausente ou <= 0
- 404 → produto não encontrado

Não existe 409 aqui: repor nunca deixa o estoque em estado inválido.

#### Segurança contra condição de corrida

A baixa é feita em **uma única operação atômica no banco**:

```sql
UPDATE produtos
   SET quantidade_estoque = quantidade_estoque - :quantidade
 WHERE id = :id AND quantidade_estoque >= :quantidade
```

A verificação de disponibilidade e o decremento acontecem na mesma transação.
Se o `UPDATE` não afetar nenhuma linha, a API descobre o motivo (produto
inexistente → 404, estoque insuficiente → 409). Isso garante que o estoque
nunca fica negativo, mesmo com requisições simultâneas.

Testado com 20 requisições paralelas de baixa 1 sobre um produto com 8 em
estoque: 8 respostas 200, 12 respostas 409 e estoque final exatamente 0.

A reposição usa o mesmo cuidado (`SET quantidade_estoque = quantidade_estoque
+ :quantidade`, nunca um valor calculado na aplicação), então devoluções
simultâneas não se sobrescrevem: 10 reposições paralelas de 1 unidade
somaram exatamente 10.

## Padrão de erro

Todas as respostas de erro seguem o mesmo formato:

```json
{ "erro": "mensagem descritiva" }
```

O 409 de estoque insuficiente traz campos extras (`quantidade_disponivel`,
`quantidade_solicitada`) além do `erro`.

Status usados: `200, 201, 204, 400, 404, 409, 500`.
Erros de validação do FastAPI (que seriam 422) são convertidos para **400**.

## Regras de negócio

- `nome` obrigatório e não vazio
- `preco` sempre > 0
- `quantidade_estoque` nunca fica negativa
- a baixa de estoque valida a disponibilidade **antes** de decrementar

## Testes

O arquivo [requests.http](requests.http) tem todos os endpoints, incluindo os
casos de erro (400 / 404 / 409) e o fluxo completo executado pela API de Pedidos.
Use a extensão REST Client do VS Code para disparar as requisições.

## Integração com a API de Pedidos

- Rodar sempre na porta combinada com a dupla (padrão: `8000`)
- Ao criar um pedido, o Node chama nesta ordem:
  1. `GET /produtos/{id}` — confere se o produto existe
  2. `GET /produtos/{id}/estoque` — confere a disponibilidade
  3. `POST /produtos/{id}/estoque/baixa` — debita o estoque
- Ao cancelar (`PUT /pedidos/{id}` com `status: cancelado`) ou remover um pedido
  confirmado, o Node chama `POST /produtos/{id}/estoque/reposicao` para devolver
  as unidades. Reativar um pedido cancelado dispara uma nova baixa, que pode
  responder 409 se o estoque já tiver sido consumido por outro pedido.
- CORS não é necessário (comunicação servidor-a-servidor)
- Chave de erro padronizada: `erro`
