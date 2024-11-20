import { config } from 'dotenv';
config();

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './utils/errorHandler';
import dashboardRouter from './routes/dashboardRoutes';
import clientRouter from './routes/clientRoutes';
import authRouter from './routes/authRoutes';
import { getPublicBusinessData } from './controllers/businessController';
import { getPublicBusinessCoupons } from './controllers/couponController';
import { getPublicMenu } from './controllers/menuController';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware';

const app = new Hono();

// Add CORS middleware
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://zvestbusiness.netlify.app',
      'https://zvest.netlify.app',
      'https://zvest-dusky.pages.dev',
      'https://zvest-nautilus.pages.dev',
      'https://aplikacija.zvest.si',
      'https://business.zvest.si',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
);

// Apply different rate limits for different routes
// Strict rate limit for auth routes (20 requests per minute)
app.use('/auth/*', rateLimitMiddleware(20, 60000));

// Moderate rate limit for dashboard and client routes (100 requests per minute)
app.use('/dashboard/*', rateLimitMiddleware(100, 60000));
app.use('/client/*', rateLimitMiddleware(100, 60000));

// Less strict rate limit for public routes (200 requests per minute)
app.use('/public/*', rateLimitMiddleware(200, 60000));

// Routes
// Test route
app.get('/test', (c) => c.text('Hello from Hono!'));

app.route('/dashboard', dashboardRouter);
app.route('/client', clientRouter);

app.route('/auth', authRouter);

app.get('/public/businesses', getPublicBusinessData);
app.get('/public/businesses/:businessId', getPublicBusinessData);
app.get('/public/businesses/:businessId/coupons', getPublicBusinessCoupons);
app.get('/public/businesses/:businessId/menu', getPublicMenu);

// Error handling
app.onError(errorHandler);

// Start the server
const port = process.env.PORT || 3000;
console.log(`Server is running on http://localhost:${port}`);

export default app;
