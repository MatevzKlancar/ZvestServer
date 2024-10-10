import { Hono } from 'hono';
import * as loyaltyController from '../controllers/loyaltyController';
import { authMiddleware } from '../middleware/authMiddleware';
import * as couponController from '../controllers/couponController';

const loyaltyRouter = new Hono();

loyaltyRouter.use('*', authMiddleware);
loyaltyRouter.post('/award', loyaltyController.awardLoyaltyPoints);
loyaltyRouter.get('/points', loyaltyController.getLoyaltyPointsInfo);

loyaltyRouter.post('/coupons', couponController.createCoupon);
loyaltyRouter.post('/coupons/redeem', couponController.redeemCoupon);
loyaltyRouter.post('/coupons/verify', couponController.verifyCoupon);

loyaltyRouter.get('/coupons/owner', couponController.getOwnerCoupons);
loyaltyRouter.delete('/coupons/owner/:couponId', couponController.deleteCoupon);

export default loyaltyRouter;
