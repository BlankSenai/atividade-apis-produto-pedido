const db = require('../db');
const { getProduto, getEstoque, baixarEstoque, reporEstoque } = require('../services/produtosClient');

/**
 * POST /pedidos — Cria um novo pedido com orquestração de estoque.
 */
async function criarPedido(req, res) {
  try {
    const { produto_id, quantidade } = req.body;

    // 1. Validação do body
    if (!produto_id) {
      return res.status(400).json({ erro: 'produto_id é obrigatório' });
    }
    if (!quantidade || quantidade <= 0 || !Number.isInteger(quantidade)) {
      return res.status(400).json({ erro: 'quantidade deve ser um inteiro maior que 0' });
    }

    // 2. Busca dados do produto na API de Produtos
    let produto;
    try {
      produto = await getProduto(produto_id);
    } catch (err) {
      if (err.status === 404) {
        return res.status(404).json({ erro: 'Produto não encontrado' });
      }
      return res.status(err.status || 503).json({ erro: err.message });
    }

    // 3. Checagem prévia de estoque
    let estoque;
    try {
      estoque = await getEstoque(produto_id);
    } catch (err) {
      return res.status(err.status || 503).json({ erro: err.message });
    }

    if (estoque.quantidade_disponivel < quantidade) {
      return res.status(409).json({ erro: 'Estoque insuficiente' });
    }

    // 4. Debita estoque (autoridade final — validação atômica no lado da API de Produtos)
    try {
      await baixarEstoque(produto_id, quantidade);
    } catch (err) {
      if (err.status === 409) {
        return res.status(409).json({ erro: 'Estoque insuficiente' });
      }
      return res.status(err.status || 503).json({ erro: err.message });
    }

    // 5. Salva pedido localmente
    const preco_unitario = produto.preco;
    const valor_total = quantidade * preco_unitario;
    const produto_nome = produto.nome;

    const stmt = db.prepare(`
      INSERT INTO pedidos (produto_id, produto_nome, quantidade, preco_unitario, valor_total, status)
      VALUES (?, ?, ?, ?, ?, 'confirmado')
    `);

    const result = stmt.run(produto_id, produto_nome, quantidade, preco_unitario, valor_total);

    // Busca o pedido recém-criado para retornar com todos os campos
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(result.lastInsertRowid);

    // 6. Retorna 201
    return res.status(201).json(pedido);
  } catch (err) {
    console.error('Erro ao criar pedido:', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
}

/**
 * GET /pedidos — Lista pedidos com paginação e filtro opcional de status.
 */
function listarPedidos(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const offset = (page - 1) * limit;
    const { status } = req.query;

    let sql = 'SELECT * FROM pedidos';
    let countSql = 'SELECT COUNT(*) as total FROM pedidos';
    const params = [];
    const countParams = [];

    if (status) {
      sql += ' WHERE status = ?';
      countSql += ' WHERE status = ?';
      params.push(status);
      countParams.push(status);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const pedidos = db.prepare(sql).all(...params);
    const { total } = db.prepare(countSql).get(...countParams);

    return res.json({
      dados: pedidos,
      pagina: page,
      limite: limit,
      total,
      total_paginas: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Erro ao listar pedidos:', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
}

/**
 * GET /pedidos/:id — Busca um pedido por ID.
 */
function buscarPedido(req, res) {
  try {
    const { id } = req.params;
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);

    if (!pedido) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    return res.json(pedido);
  } catch (err) {
    console.error('Erro ao buscar pedido:', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
}

/**
 * PUT /pedidos/:id — Atualiza apenas o status do pedido (ex.: cancelar).
 *
 * Cada troca de status ajusta o estoque na API de Produtos:
 *   confirmado -> cancelado : devolve a quantidade (estorno)
 *   cancelado  -> confirmado: debita a quantidade de novo (pode dar 409)
 * Reenviar o mesmo status nao mexe no estoque (idempotente).
 */
async function atualizarPedido(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ erro: 'status é obrigatório' });
    }

    const statusPermitidos = ['confirmado', 'cancelado'];
    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: `status deve ser um dos seguintes: ${statusPermitidos.join(', ')}` });
    }

    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    // Cancelamento: devolve o estoque antes de gravar o novo status.
    // Se a API de Produtos falhar, o pedido continua confirmado — melhor
    // recusar o cancelamento do que perder as unidades do estoque.
    if (pedido.status === 'confirmado' && status === 'cancelado') {
      try {
        await reporEstoque(pedido.produto_id, pedido.quantidade);
      } catch (err) {
        return res.status(err.status || 503).json({ erro: err.message });
      }
    }

    // Reativação: precisa debitar o estoque de novo, senão o pedido voltaria
    // a valer sem reservar as unidades.
    if (pedido.status === 'cancelado' && status === 'confirmado') {
      try {
        await baixarEstoque(pedido.produto_id, pedido.quantidade);
      } catch (err) {
        if (err.status === 409) {
          return res.status(409).json({ erro: 'Estoque insuficiente' });
        }
        return res.status(err.status || 503).json({ erro: err.message });
      }
    }

    db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run(status, id);

    const pedidoAtualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    return res.json(pedidoAtualizado);
  } catch (err) {
    console.error('Erro ao atualizar pedido:', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
}

/**
 * DELETE /pedidos/:id — Remove um pedido.
 *
 * Se o pedido ainda estava confirmado, devolve o estoque antes de apagar.
 * Um pedido já cancelado teve o estoque devolvido no cancelamento.
 */
async function deletarPedido(req, res) {
  try {
    const { id } = req.params;

    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    if (pedido.status === 'confirmado') {
      try {
        await reporEstoque(pedido.produto_id, pedido.quantidade);
      } catch (err) {
        return res.status(err.status || 503).json({ erro: err.message });
      }
    }

    db.prepare('DELETE FROM pedidos WHERE id = ?').run(id);
    return res.status(204).send();
  } catch (err) {
    console.error('Erro ao deletar pedido:', err);
    return res.status(500).json({ erro: 'Erro interno do servidor' });
  }
}

module.exports = {
  criarPedido,
  listarPedidos,
  buscarPedido,
  atualizarPedido,
  deletarPedido,
};
