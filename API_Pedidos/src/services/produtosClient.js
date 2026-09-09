const axios = require('axios');

const baseURL = process.env.PRODUCTS_API_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL,
  timeout: 5000,
});

/**
 * Busca os dados de um produto pelo id.
 * @param {number} id - ID do produto
 * @returns {Promise<object>} dados do produto (nome, preco, etc.)
 */
async function getProduto(id) {
  try {
    const { data } = await client.get(`/produtos/${id}`);
    return data;
  } catch (err) {
    if (err.response) {
      const error = new Error(err.response.data?.erro || 'Erro na API de Produtos');
      error.status = err.response.status;
      throw error;
    }
    // Erro de rede / timeout / connection refused
    const error = new Error('Serviço de produtos indisponível');
    error.status = 503;
    throw error;
  }
}

/**
 * Consulta o estoque disponível de um produto.
 * @param {number} id - ID do produto
 * @returns {Promise<object>} { quantidade_disponivel, ... }
 */
async function getEstoque(id) {
  try {
    const { data } = await client.get(`/produtos/${id}/estoque`);
    return data;
  } catch (err) {
    if (err.response) {
      const error = new Error(err.response.data?.erro || 'Erro na API de Produtos');
      error.status = err.response.status;
      throw error;
    }
    const error = new Error('Serviço de produtos indisponível');
    error.status = 503;
    throw error;
  }
}

/**
 * Debita estoque de um produto (chamada atômica).
 * @param {number} id - ID do produto
 * @param {number} quantidade - Quantidade a debitar
 * @returns {Promise<object>} resposta da API de Produtos
 */
async function baixarEstoque(id, quantidade) {
  try {
    const { data } = await client.post(`/produtos/${id}/estoque/baixa`, { quantidade });
    return data;
  } catch (err) {
    if (err.response) {
      const error = new Error(err.response.data?.erro || 'Erro na API de Produtos');
      error.status = err.response.status;
      throw error;
    }
    const error = new Error('Serviço de produtos indisponível');
    error.status = 503;
    throw error;
  }
}

/**
 * Devolve estoque de um produto (estorno de pedido cancelado).
 * @param {number} id - ID do produto
 * @param {number} quantidade - Quantidade a devolver
 * @returns {Promise<object>} resposta da API de Produtos
 */
async function reporEstoque(id, quantidade) {
  try {
    const { data } = await client.post(`/produtos/${id}/estoque/reposicao`, { quantidade });
    return data;
  } catch (err) {
    if (err.response) {
      const error = new Error(err.response.data?.erro || 'Erro na API de Produtos');
      error.status = err.response.status;
      throw error;
    }
    const error = new Error('Serviço de produtos indisponível');
    error.status = 503;
    throw error;
  }
}

module.exports = { getProduto, getEstoque, baixarEstoque, reporEstoque };
