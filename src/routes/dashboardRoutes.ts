import { Hono } from 'hono';
import { handleQRCode } from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';
import invitationRouter from './invitationRouter';

const dashboardRouter = new Hono();

// Apply authMiddleware to specific routes
dashboardRouter.use('/business/*', authMiddleware);
dashboardRouter.use('/loyalty/*', authMiddleware);
dashboardRouter.use('/staff/*', authMiddleware);
dashboardRouter.post('/scan', authMiddleware, handleQRCode);

// Apply invitationRouter without authMiddleware
dashboardRouter.route('/invitations', invitationRouter);

export default dashboardRouter;
