import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import staffRouter from './staffRoutes';
import { handleQRCode } from '../controllers/qrCodeController';

const dashboardRouter = new Hono();

dashboardRouter.route('/business', businessRouter);
dashboardRouter.route('/loyalty', loyaltyRouter);
dashboardRouter.route('/staff', staffRouter);
dashboardRouter.post('/scan', handleQRCode);

export default dashboardRouter;
