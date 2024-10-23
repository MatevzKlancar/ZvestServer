import { Hono } from 'hono';
import businessRouter from './businessRoutes';
import loyaltyRouter from './loyaltyRoutes';
import staffRouter from './staffRoutes';

const dashboardRouter = new Hono();

dashboardRouter.route('/business', businessRouter);
dashboardRouter.route('/loyalty', loyaltyRouter);
dashboardRouter.route('/staff', staffRouter);

export default dashboardRouter;
