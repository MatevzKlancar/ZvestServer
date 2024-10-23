import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import staffRouter from './staffRoutes';
import { handleQRCode } from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';

const dashboardRouter = new Hono();

dashboardRouter.use('*', authMiddleware);

dashboardRouter.route('/business', businessRouter);
dashboardRouter.route('/loyalty', loyaltyRouter);
dashboardRouter.route('/staff', staffRouter);
dashboardRouter.post('/scan', handleQRCode);

export default dashboardRouter;
