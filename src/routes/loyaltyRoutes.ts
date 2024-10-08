import { Hono } from 'hono';
import * as loyaltyController from '../controllers/loyaltyController';
import { authMiddleware } from '../middleware/authMiddleware';

const loyaltyRouter = new Hono();

loyaltyRouter.use('*', authMiddleware);
loyaltyRouter.post('/award', loyaltyController.awardLoyaltyPoints);
loyaltyRouter.get('/points', loyaltyController.getLoyaltyPointsInfo);

export default loyaltyRouter;
