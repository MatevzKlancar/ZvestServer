import { config } from 'dotenv';
config();

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { signUp, confirmSignUp } from './controllers/authController';
import authRouter from './routes/authRoutes';
import { errorHandler } from './utils/errorHandler';
import qrCodeRouter from './routes/qrCodeRoutes';
import loyaltyRouter from './routes/loyaltyRoutes';
import staffRouter from './routes/staffRoutes';
import businessRouter from './routes/businessRoutes';

const app = new Hono();

// Add CORS middleware
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'https://zvestbusiness.netlify.app',
      'https://zvest.netlify.app',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
);

// Routes
// Test route
app.get('/test', (c) => c.text('Hello from Hono!'));

app.route('/auth', authRouter);
app.route('/qr-code', qrCodeRouter);
app.route('/loyalty', loyaltyRouter);
app.post('/auth/signup', signUp);
app.get('/auth/confirm', confirmSignUp);
app.get('/auth/signup-success', (c) =>
  c.text('Your account has been successfully confirmed!')
);
app.route('/api/loyalty', loyaltyRouter);
app.route('/api/staff', staffRouter);
app.route('/api/business', businessRouter);

// Error handling
app.onError(errorHandler);

// Start the server
const port = process.env.PORT || 3000;
console.log(`Server is running on http://localhost:${port}`);

export default app;
