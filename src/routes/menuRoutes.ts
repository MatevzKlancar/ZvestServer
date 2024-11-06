import { Hono } from 'hono';
import * as menuController from '../controllers/menuController';
import { authMiddleware } from '../middleware/authMiddleware';

const menuRouter = new Hono();

menuRouter.use('*', authMiddleware);

menuRouter.post('/create', menuController.createMenu);
menuRouter.get('/', menuController.getMenu);
menuRouter.put('/:menuId', menuController.updateMenu);
menuRouter.delete('/:menuId', menuController.deleteMenu);

export default menuRouter;
