import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import { getQRCode } from '../controllers/qrCodeController';

const clientRouter = new Hono();

clientRouter.route('/business', businessRouter);
clientRouter.route('/loyalty', loyaltyRouter);
clientRouter.get('/qr-code', getQRCode);

export default clientRouter;
