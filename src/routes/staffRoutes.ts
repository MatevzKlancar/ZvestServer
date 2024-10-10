import { Hono } from 'hono';
import * as staffController from '../controllers/staffController';
import { authMiddleware } from '../middleware/authMiddleware';

const staffRouter = new Hono();

staffRouter.use('*', authMiddleware);
staffRouter.get('/action-history', staffController.getStaffActionHistory);

export default staffRouter;
