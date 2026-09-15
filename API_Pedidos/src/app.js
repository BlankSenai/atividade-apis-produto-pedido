const express = require('express');
const swaggerUi = require('swagger-ui-express');
const pedidosRoutes = require('./routes/pedidos.routes');
const openapi = require('./docs/openapi');

const app = express();

// Middlewares
app.use(express.json());

// Documentação interativa (Swagger UI) — http://localhost:4000/docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'API de Pedidos' }));

// Schema OpenAPI cru, para importar no Insomnia/Postman
app.get('/openapi.json', (_req, res) => res.json(openapi));

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
