import { config } from 'dotenv';
config();

import { Hono } from 'hono';
import { signUp, confirmSignUp } from './controllers/authController';
import authRouter from './routes/authRoutes';
import { errorHandler } from './utils/errorHandler';
import qrCodeRouter from './routes/qrCodeRoutes';

const app = new Hono();

// Routes
app.route('/auth', authRouter);
app.route('/qr-code', qrCodeRouter);
app.post('/auth/signup', signUp);
app.get('/auth/confirm', confirmSignUp);
app.get('/auth/signup-success', (c) => c.text('Your account has been successfully confirmed!'));
// Error handling
app.onError(errorHandler);

// Start the server
const port = process.env.PORT || 3000;
console.log(`Server is running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};