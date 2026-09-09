const express = require('express');
const pedidosRoutes = require('./routes/pedidos.routes');

const app = express();

// Middlewares
app.use(express.json());

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', servico: 'API de Pedidos' });
});

// Rotas
app.use('/pedidos', pedidosRoutes);

// Middleware de erro genérico
app.use((err, _req, res, _next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

module.exports = app;
