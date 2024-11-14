import { Context } from 'hono';
import { supabase } from '../config/supabase';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';

interface Business {
  name: string;
}

interface LoyaltyPoint {
  id: string;
  points: number;
  awarded_at: string;
  business_id: string;
  awarded_by: string;
  businesses: Business | null;
}

interface Coupon {
  name: string;
  points_required: number;
}

interface RedeemedCoupon {
  id: string;
  redeemed_at: string;
  verified: boolean;
  verified_at: string | null;
  business_id: string;
  businesses: Business | null;
  coupons: Coupon | null;
}

interface HistoryItem {
  type: 'POINTS_AWARDED' | 'COUPON_REDEEMED' | 'COUPON_VERIFIED';
  timestamp: string;
  businessName: string;
  businessId: string;
  details: {
    points?: number;
    couponName?: string;
    pointsRequired?: number;
    verified?: boolean;
  };
}

interface CouponSpecificPointHistory {
  id: string;
  points: number;
  last_updated: string;
  business_id: string;
  coupon_id: string;
  businesses: Business | null;
  coupons: Coupon | null;
}

export const getUserActionHistory = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const userId = authUser.id;

    // Get loyalty points history
    const { data: loyaltyHistory, error: loyaltyError } = await supabase
      .from('loyalty_points')
      .select(
        `
        id,
        points,
        awarded_at,
        business_id,
        awarded_by,
        businesses (
          name
        )
      `
      )
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false });

    if (loyaltyError) {
      throw new CustomError('Error fetching loyalty points history', 500);
    }

    // Get coupon-specific points history
    const { data: couponPointsHistory, error: couponPointsError } =
      await supabase
        .from('coupon_specific_points')
        .select(
          `
        id,
        points,
        last_updated,
        business_id,
        coupon_id,
        businesses (
          name
        ),
        coupons (
          name,
          points_required
        )
      `
        )
        .eq('user_id', userId)
        .order('last_updated', { ascending: false });

    if (couponPointsError) {
      throw new CustomError('Error fetching coupon points history', 500);
    }

    // Get redeemed coupons history
    const { data: redemptionHistory, error: redemptionError } = await supabase
      .from('redeemed_coupons')
      .select(
        `
        id,
        redeemed_at,
        verified,
        verified_at,
        business_id,
        coupons (
          name,
          points_required
        ),
        businesses (
          name
        )
      `
      )
      .eq('user_id', userId)
      .order('redeemed_at', { ascending: false });

    if (redemptionError) {
      throw new CustomError('Error fetching redemption history', 500);
    }

    // Combine and format the histories
    const combinedHistory: HistoryItem[] = [
      ...((loyaltyHistory || []) as unknown as LoyaltyPoint[]).map((item) => ({
        type: 'POINTS_AWARDED' as const,
        timestamp: item.awarded_at,
        businessName: item.businesses?.name || '',
        businessId: item.business_id,
        details: {
          points: item.points,
          pointType: 'LOYALTY',
        },
      })),
      ...(
        (couponPointsHistory || []) as unknown as CouponSpecificPointHistory[]
      ).map((item) => ({
        type: 'POINTS_AWARDED' as const,
        timestamp: item.last_updated,
        businessName: item.businesses?.name || '',
        businessId: item.business_id,
        details: {
          points: item.points,
          pointType: 'COUPON_SPECIFIC',
          couponName: item.coupons?.name,
          couponId: item.coupon_id,
        },
      })),
      ...((redemptionHistory || []) as unknown as RedeemedCoupon[]).map(
        (item) => {
          const type: HistoryItem['type'] = item.verified
            ? 'COUPON_VERIFIED'
            : 'COUPON_REDEEMED';
          return {
            type,
            timestamp: item.verified ? item.verified_at! : item.redeemed_at,
            businessName: item.businesses?.name || '',
            businessId: item.business_id,
            details: {
              couponName: item.coupons?.name,
              pointsRequired: item.coupons?.points_required,
              verified: item.verified,
            },
          };
        }
      ),
    ].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return sendSuccessResponse(
      c,
      { history: combinedHistory },
      'User action history retrieved successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
