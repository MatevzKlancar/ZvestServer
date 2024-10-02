import { Hono } from 'hono';
import * as qrCodeController from '../controllers/qrCodeController';
const qrCodeRouter = new Hono();

qrCodeRouter.get('/users-qr-code', qrCodeController.getQRCode);
export default qrCodeRouter;