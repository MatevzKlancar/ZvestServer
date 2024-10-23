import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import qrCodeRouter from './qrCodeRoutes';

const clientRouter = new Hono();

clientRouter.route('/business', businessRouter);
clientRouter.route('/loyalty', loyaltyRouter);
clientRouter.route('/qr-code', qrCodeRouter);

export default clientRouter;
