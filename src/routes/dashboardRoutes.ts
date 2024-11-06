import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import staffRouter from './staffRoutes';
import menuRouter from './menuRoutes';
import { handleQRCode } from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';
import invitationRouter from './invitationRouter';

const dashboardRouter = new Hono();

dashboardRouter.use('*', authMiddleware);

dashboardRouter.route('/business', businessRouter);
dashboardRouter.route('/loyalty', loyaltyRouter);
dashboardRouter.route('/staff', staffRouter);
dashboardRouter.route('/menu', menuRouter);
dashboardRouter.post('/scan', handleQRCode);
dashboardRouter.route('/invitations', invitationRouter);

export default dashboardRouter;
