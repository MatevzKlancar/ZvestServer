import { config } from 'dotenv';
config();

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { signUp, confirmSignUp } from './controllers/authController';
import authRouter from './routes/authRoutes';
import { errorHandler } from './utils/errorHandler';
import qrCodeRouter from './routes/qrCodeRoutes';
import loyaltyRouter from './routes/loyaltyRoutes';
import { authMiddleware } from './middleware/authMiddleware';

const app = new Hono();

// Add CORS middleware
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
);

// Routes
app.route('/auth', authRouter);
app.route('/qr-code', qrCodeRouter);
app.route('/loyalty', loyaltyRouter);
app.post('/auth/signup', signUp);
app.get('/auth/confirm', confirmSignUp);
app.get('/auth/signup-success', (c) =>
  c.text('Your account has been successfully confirmed!')
);
app.route('/api/loyalty', loyaltyRouter);

// Error handling
app.onError(errorHandler);

// Start the server
const port = process.env.PORT || 3000;
console.log(`Server is running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
