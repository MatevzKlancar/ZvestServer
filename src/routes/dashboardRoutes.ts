import { Hono } from 'hono';
import { handleQRCode } from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';
import invitationRouter from './invitationRouter';
import businessRouter from './businessRoutes';

const dashboardRouter = new Hono();

// Apply businessRouter
dashboardRouter.route('/business', businessRouter);

// Other routes
dashboardRouter.use('/loyalty/*', authMiddleware);
dashboardRouter.use('/staff/*', authMiddleware);
dashboardRouter.post('/scan', authMiddleware, handleQRCode);

// Apply invitationRouter without authMiddleware
dashboardRouter.route('/invitations', invitationRouter);

export default dashboardRouter;
