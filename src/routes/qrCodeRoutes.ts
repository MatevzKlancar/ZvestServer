import { Hono } from 'hono';
import * as qrCodeController from '../controllers/qrCodeController';
import { authMiddleware } from '../middleware/authMiddleware';

const qrCodeRouter = new Hono();

qrCodeRouter.use('*', authMiddleware);
qrCodeRouter.get('', qrCodeController.getQRCode);

export default qrCodeRouter;
