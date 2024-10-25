import { config } from 'dotenv';
config();

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './utils/errorHandler';
import dashboardRouter from './routes/dashboardRoutes';
import clientRouter from './routes/clientRoutes';
import authRouter from './routes/authRoutes';
import { getPublicBusinessData } from './controllers/businessController';

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

app.route('/dashboard', dashboardRouter);
app.route('/client', clientRouter);

app.route('/auth', authRouter);

app.get('/public/businesses', getPublicBusinessData);
app.get('/public/businesses/:businessId', getPublicBusinessData);

// Error handling
app.onError(errorHandler);

// Start the server
const port = process.env.PORT || 3000;
console.log(`Server is running on http://localhost:${port}`);

export default app;
