import { Hono } from 'hono';
import * as authController from '../controllers/authController';
const authRouter = new Hono();

authRouter.post('/signup', authController.signUp);
authRouter.post('/login', authController.login);
export default authRouter;