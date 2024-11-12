import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import staffRouter from './staffRoutes';
import menuRouter from './menuRoutes';
import { handleQRCode } from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';
import invitationRouter from './invitationRouter';
import { verifyCoupon } from '../controllers/couponController';

const dashboardRouter = new Hono();

dashboardRouter.use('/business/*', authMiddleware);
dashboardRouter.use('/loyalty/*', authMiddleware);
dashboardRouter.use('/staff/*', authMiddleware);
dashboardRouter.use('/menu/*', authMiddleware);
dashboardRouter.use('/scan', authMiddleware);
dashboardRouter.use('/invitations/create', authMiddleware);
dashboardRouter.use('/verify-coupon', authMiddleware);

dashboardRouter.route('/business', businessRouter);
dashboardRouter.route('/loyalty', loyaltyRouter);
dashboardRouter.route('/staff', staffRouter);
dashboardRouter.route('/menu', menuRouter);
dashboardRouter.post('/scan', handleQRCode);
dashboardRouter.route('/invitations', invitationRouter);
dashboardRouter.post('/verify-coupon', verifyCoupon);

export default dashboardRouter;
