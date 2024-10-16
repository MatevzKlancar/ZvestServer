import { Hono } from 'hono';
import * as qrCodeController from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';

const qrCodeRouter = new Hono();

qrCodeRouter.use('*', authMiddleware);
qrCodeRouter.get('/users-qr-code', qrCodeController.getQRCode);
qrCodeRouter.post('/scan', qrCodeController.handleQRCode);

export default qrCodeRouter;
