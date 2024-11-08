import { Hono } from 'hono';
import * as invitationController from '../controllers/invitationController';
import { authMiddleware } from '../middleware/authMiddleware';

const invitationRouter = new Hono();

// Apply authMiddleware only to the '/create' route
invitationRouter.post(
  '/create',
  authMiddleware,
  invitationController.createInvitation
);

// No authMiddleware for this route
invitationRouter.post(
  '/confirm-and-set-password',
  invitationController.confirmAndSetPassword
);

// Add this route with authMiddleware
invitationRouter.get(
  '/list',
  authMiddleware,
  invitationController.getInvitations
);

export default invitationRouter;
