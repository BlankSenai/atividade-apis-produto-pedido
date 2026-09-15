/**
 * Especificação OpenAPI 3.0 da API de Pedidos.
 *
 * Diferente da API de Produtos (FastAPI, que gera o schema a partir do código),
 * aqui a spec é escrita à mão. Ao mexer nas rotas ou nos status de
 * pedidos.controller.js, atualize este arquivo junto.
 */

const pedido = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    produto_id: { type: 'integer', example: 1 },
    produto_nome: { type: 'string', example: 'Teclado Mecânico' },
    quantidade: { type: 'integer', example: 2 },
    preco_unitario: { type: 'number', format: 'float', example: 250.0 },
    valor_total: { type: 'number', format: 'float', example: 500.0 },
    status: { type: 'string', enum: ['confirmado', 'cancelado'], example: 'confirmado' },
    criado_em: { type: 'string', example: '2025-01-01 12:00:00' },
  },
};

const erro = {
  type: 'object',
  properties: {
    erro: { type: 'string', example: 'Pedido não encontrado' },
  },
};

/** Resposta de erro reaproveitada nas rotas. */
const respostaErro = (descricao, exemplo) => ({
  description: descricao,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Erro' },
      example: { erro: exemplo },
    },
  },
});

const idNoCaminho = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer' },
  description: 'ID do pedido',
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'API de Pedidos',
    version: '1.0.0',
    description:
      'Registro de pedidos em Node.js + Express. Cada pedido reserva estoque na ' +
      'API de Produtos (FastAPI): a criação debita, o cancelamento e a remoção ' +
      'devolvem as unidades.\n\n' +
      '**A API de Produtos precisa estar no ar** (padrão `http://localhost:8000`) — ' +
      'sem ela as rotas que mexem em estoque respondem `503`.',
  },
  servers: [{ url: 'http://localhost:4000', description: 'Ambiente local' }],
  tags: [
    { name: 'pedidos', description: 'CRUD de pedidos com orquestração de estoque' },
    { name: 'health', description: 'Verificação de disponibilidade' },
  ],
  components: {
    schemas: {
      Pedido: pedido,
      Erro: erro,
      PedidoCreate: {
        type: 'object',
        required: ['produto_id', 'quantidade'],
        properties: {
          produto_id: {
            type: 'integer',
            description: 'ID de um produto existente na API de Produtos',
            example: 1,
          },
          quantidade: {
            type: 'integer',
            minimum: 1,
            description: 'Inteiro maior que zero',
            example: 2,
          },
        },
      },
      PedidoUpdate: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['confirmado', 'cancelado'],
            description:
              'Único campo editável. `confirmado` → `cancelado` devolve o estoque; ' +
              '`cancelado` → `confirmado` debita de novo e pode responder 409.',
            example: 'cancelado',
          },
        },
      },
      PedidoLista: {
        type: 'object',
        properties: {
          dados: { type: 'array', items: { $ref: '#/components/schemas/Pedido' } },
          pagina: { type: 'integer', example: 1 },
          limite: { type: 'integer', example: 10 },
          total: { type: 'integer', example: 42 },
          total_paginas: { type: 'integer', example: 5 },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['health'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Serviço no ar',
            content: {
              'application/json': {
                example: { status: 'ok', servico: 'API de Pedidos' },
              },
            },
          },
        },
      },
    },

    '/pedidos': {
      post: {
        tags: ['pedidos'],
        summary: 'Cria um pedido e debita o estoque',
        description:
          'Consulta o produto, confere a disponibilidade e debita o estoque na API ' +
          'de Produtos antes de gravar o pedido. `produto_nome`, `preco_unitario` e ' +
          '`valor_total` são preenchidos a partir dos dados do produto.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PedidoCreate' },
            },
          },
        },
        responses: {
          201: {
            description: 'Pedido criado e estoque debitado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Pedido' } },
            },
          },
          400: respostaErro(
            'Body inválido: produto_id ausente, ou quantidade não inteira / menor ou igual a zero',
            'quantidade deve ser um inteiro maior que 0'
          ),
          404: respostaErro('O produto_id informado não existe na API de Produtos', 'Produto não encontrado'),
          409: respostaErro('O produto não tem unidades suficientes em estoque', 'Estoque insuficiente'),
          503: respostaErro('API de Produtos fora do ar ou sem resposta', 'Serviço de produtos indisponível'),
          500: respostaErro('Erro interno', 'Erro interno do servidor'),
        },
      },
      get: {
        tags: ['pedidos'],
        summary: 'Lista pedidos com paginação',
        description: 'Ordenados do mais recente para o mais antigo (`id` decrescente).',
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Página desejada. Valores inválidos caem para 1.',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 10, minimum: 1 },
            description: 'Itens por página. Valores inválidos caem para 10.',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['confirmado', 'cancelado'] },
            description: 'Filtro opcional por status (match exato).',
          },
        ],
        responses: {
          200: {
            description: 'Página de pedidos',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/PedidoLista' } },
            },
          },
          500: respostaErro('Erro interno', 'Erro interno do servidor'),
        },
      },
    },

    '/pedidos/{id}': {
      get: {
        tags: ['pedidos'],
        summary: 'Busca um pedido por ID',
        parameters: [idNoCaminho],
        responses: {
          200: {
            description: 'Pedido encontrado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Pedido' } },
            },
          },
          404: respostaErro('Não existe pedido com esse id', 'Pedido não encontrado'),
          500: respostaErro('Erro interno', 'Erro interno do servidor'),
        },
      },
      put: {
        tags: ['pedidos'],
        summary: 'Altera o status do pedido (cancelar / reativar)',
        description:
          'Só o `status` muda — os demais campos são imutáveis.\n\n' +
          '- `confirmado` → `cancelado`: devolve as unidades ao estoque\n' +
          '- `cancelado` → `confirmado`: debita as unidades de novo, podendo dar `409` ' +
          'se outro pedido já tiver consumido o estoque\n' +
          '- mesmo status de novo: não mexe no estoque (idempotente)\n\n' +
          'Se a API de Produtos falhar, o status **não** é gravado.',
        parameters: [idNoCaminho],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PedidoUpdate' },
            },
          },
        },
        responses: {
          200: {
            description: 'Pedido atualizado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Pedido' } },
            },
          },
          400: respostaErro(
            'status ausente ou fora de confirmado / cancelado',
            'status deve ser um dos seguintes: confirmado, cancelado'
          ),
          404: respostaErro('Não existe pedido com esse id', 'Pedido não encontrado'),
          409: respostaErro(
            'Reativação impossível: o estoque já foi consumido por outro pedido',
            'Estoque insuficiente'
          ),
          503: respostaErro('API de Produtos fora do ar ou sem resposta', 'Serviço de produtos indisponível'),
          500: respostaErro('Erro interno', 'Erro interno do servidor'),
        },
      },
      delete: {
        tags: ['pedidos'],
        summary: 'Remove um pedido',
        description:
          'Se o pedido ainda estava `confirmado`, devolve as unidades ao estoque antes ' +
          'de apagar. Um pedido `cancelado` já teve o estorno feito no cancelamento.',
        parameters: [idNoCaminho],
        responses: {
          204: { description: 'Pedido removido (sem corpo na resposta)' },
          404: respostaErro('Não existe pedido com esse id', 'Pedido não encontrado'),
          503: respostaErro('API de Produtos fora do ar ou sem resposta', 'Serviço de produtos indisponível'),
          500: respostaErro('Erro interno', 'Erro interno do servidor'),
        },
      },
    },
  },
};
