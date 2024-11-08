import { Hono } from 'hono';
import * as loyaltyController from '../controllers/loyaltyController';
import { authMiddleware } from '../middleware/authMiddleware';
import * as couponController from '../controllers/couponController';

const loyaltyRouter = new Hono();

loyaltyRouter.use('*', authMiddleware);
loyaltyRouter.get('/points', loyaltyController.getLoyaltyPointsInfo);

loyaltyRouter.post('/coupons', couponController.createCoupon);
loyaltyRouter.post('/coupons/redeem', couponController.redeemCoupon);

loyaltyRouter.get('/coupons/owner', couponController.getOwnerCoupons);
loyaltyRouter.delete('/coupons/owner/:couponId', couponController.deleteCoupon);

loyaltyRouter.get('/user-points', loyaltyController.getUserLoyaltyPoints);

loyaltyRouter.get(
  '/coupons/business/:businessId',
  couponController.getBusinessCoupons
);

export default loyaltyRouter;
