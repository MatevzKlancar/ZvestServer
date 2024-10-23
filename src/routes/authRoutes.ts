import { Hono } from 'hono';
import * as authController from '../controllers/authController';
const authRouter = new Hono();

authRouter.post('/signup', authController.signUp);
authRouter.post('/login', authController.login);
authRouter.get('/confirm', authController.confirmSignUp);
authRouter.get('/signup-success', (c) =>
  c.text('Your account has been successfully confirmed!')
);

export default authRouter;
