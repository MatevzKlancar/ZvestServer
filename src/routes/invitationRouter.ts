import { Hono } from 'hono';
import * as invitationController from '../controllers/invitationController';
import { authMiddleware } from '../middleware/authMiddleware';

const invitationRouter = new Hono();

invitationRouter.use('*', authMiddleware);
invitationRouter.post('/create', invitationController.createInvitation);

export default invitationRouter;
