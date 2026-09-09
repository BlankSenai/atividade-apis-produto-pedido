const { Router } = require('express');
const controller = require('../controllers/pedidos.controller');

const router = Router();

router.post('/', controller.criarPedido);
router.get('/', controller.listarPedidos);
router.get('/:id', controller.buscarPedido);
router.put('/:id', controller.atualizarPedido);
router.delete('/:id', controller.deletarPedido);

module.exports = router;
