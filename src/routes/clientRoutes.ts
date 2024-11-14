import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import { getQRCode } from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';
import { getUserActionHistory } from '../controllers/userController';

const clientRouter = new Hono();

clientRouter.use('*', authMiddleware);

clientRouter.route('/business', businessRouter);
clientRouter.route('/loyalty', loyaltyRouter);
clientRouter.get('/qr-code', getQRCode);
clientRouter.get('/history', getUserActionHistory);

export default clientRouter;
