import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { signUp, confirmSignUp } from './controllers/authController';
import authRouter from './routes/authRoutes';
import { errorHandler } from './utils/errorHandler';
import qrCodeRouter from './routes/qrCodeRoutes';
import loyaltyRouter from './routes/loyaltyRoutes';
import staffRouter from './routes/staffRoutes';

const app = new Hono();

// Add CORS middleware
app.use(
  '*',
  cors({
    origin: ['http://localhost:5173', 'https://*.vercel.app'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
);

// Routes
app.get('/', (c) => c.text('Hello from Hono!'));
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

// Error handling
app.onError(errorHandler);

export default app;
