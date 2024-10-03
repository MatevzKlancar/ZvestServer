import { Hono } from 'hono';
import * as loyaltyController from '../controllers/loyaltyController';

const loyaltyRouter = new Hono();

loyaltyRouter.post('/award', loyaltyController.awardLoyaltyPoints);

export default loyaltyRouter;
