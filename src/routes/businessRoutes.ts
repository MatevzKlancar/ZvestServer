import { Hono } from 'hono';
import * as businessController from '../controllers/businessController';
import { authMiddleware } from '../middleware/authMiddleware';

const businessRouter = new Hono();

businessRouter.use('*', authMiddleware);
businessRouter.post('/create', businessController.createBusiness);
businessRouter.put('/update', businessController.updateBusiness);
businessRouter.delete('/delete', businessController.deleteBusiness);
businessRouter.get('/get', businessController.getBusiness);

// Add this new route
businessRouter.get(
  '/all/:businessId?',
  businessController.getAllOrSpecificBusiness
);

export default businessRouter;
