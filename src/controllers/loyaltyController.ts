import { Context } from 'hono';
import { supabase } from '../config/supabase';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';
import { supabaseAdmin } from '../config/supabaseAdmin';

export const awardLoyaltyPoints = async (c: Context) => {
  const authUser = c.get('user');
  const { qrCodeData, amount } = await c.req.json();

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const staffUserId = authUser.id;

  // Check if the user is a staff member and get business info
  const { data: userData, error: fetchUserError } =
    await supabaseAdmin.auth.admin.getUserById(staffUserId);

  if (fetchUserError || !userData || !userData.user) {
    return c.json({ error: 'Error fetching user data' }, 500);
  }

  const staffUser = userData.user;

  const staffData = {
    user_id: staffUser.id,
    business_id: staffUser.user_metadata?.business_id,
    role: staffUser.user_metadata?.role,
  };

  if (!['Staff', 'Owner'].includes(staffData.role)) {
    return c.json(
      {
        error: 'Access denied. Only staff members and owners can award points.',
      },
      403
    );
  }

  if (!qrCodeData || !amount || isNaN(amount) || amount <= 0) {
    return c.json(
      { error: 'Invalid input. Please provide valid QR code data and amount.' },
      400
    );
  }

  // Extract the UUID part from the qrCodeData
  const userId = qrCodeData.split('-').slice(0, 5).join('-');

  // Verify if the user exists
  const { data: customerData, error: customerError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (customerError || !customerData || !customerData.user) {
    console.error('Error fetching user data:', customerError);
    return c.json({ error: 'Invalid or non-existent user.' }, 400);
  }

  // Start a Supabase transaction
  const { data, error } = await supabase.rpc('award_loyalty_points', {
    p_user_id: userId,
    p_business_id: staffData.business_id,
    p_points: amount,
    p_awarded_by: staffData.user_id,
  });

  if (error) {
    console.error('Error awarding loyalty points:', error);
    return c.json({ error: 'Error awarding loyalty points' }, 500);
  }

  // Log the staff action
  await supabase.from('staff_actions').insert({
    staff_user_id: staffUserId,
    action_type: 'AWARD_POINTS',
    action_details: {
      points_awarded: amount,
      recipient_user_id: userId,
    },
    business_id: staffData.business_id,
  });

  return c.json({
    message: 'Loyalty points awarded successfully',
    awarded: amount,
    total_points: data.total_points,
  });
};

export const getLoyaltyPointsInfo = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const staffUserId = authUser.id;

    // Check if the user is a staff member or owner and get business info
    const { data: userData, error: fetchUserError } =
      await supabaseAdmin.auth.admin.getUserById(staffUserId);

    if (fetchUserError || !userData || !userData.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const staffUser = userData.user;

    const staffData = {
      user_id: staffUser.id,
      business_id: staffUser.user_metadata?.business_id,
      role: staffUser.user_metadata?.role,
    };

    if (staffData.role !== 'Staff' && staffData.role !== 'Owner') {
      throw new CustomError(
        'Access denied. Only staff members or owners can view loyalty points information.',
        403
      );
    }

    // Get loyalty points information for the business
    const { data: loyaltyPointsData, error: loyaltyPointsError } =
      await supabase
        .from('loyalty_points')
        .select(
          `
          id,
          user_id,
          points,
          awarded_by,
          awarded_at
        `
        )
        .eq('business_id', staffData.business_id)
        .order('awarded_at', { ascending: false });

    if (loyaltyPointsError) {
      throw new CustomError('Error fetching loyalty points data', 500);
    }

    // Fetch user details for each loyalty point entry
    const loyaltyPointsWithUserDetails = await Promise.all(
      loyaltyPointsData.map(async (point) => {
        const { data: customerData } = await supabase.auth.admin.getUserById(
          point.user_id
        );
        const { data: staffData } = await supabase.auth.admin.getUserById(
          point.awarded_by
        );

        return {
          ...point,
          customer: customerData?.user
            ? {
                email: customerData.user.email,
                role: customerData.user.user_metadata?.role,
              }
            : null,
          staff: staffData?.user
            ? {
                email: staffData.user.email,
                role: staffData.user.user_metadata?.role,
              }
            : null,
        };
      })
    );

    return sendSuccessResponse(
      c,
      { data: loyaltyPointsWithUserDetails },
      'Loyalty points information retrieved successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const getUserLoyaltyPoints = async (c: Context) => {
  const authUser = c.get('user');
  const businessId = c.req.query('business_id');

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = authUser.id;

  let query = supabase
    .from('user_loyalty_points')
    .select('business_id, total_points, businesses(name)')
    .eq('user_id', userId);

  if (businessId) {
    // Validate the business_id format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(businessId)) {
      return c.json({ error: 'Invalid business ID format' }, 400);
    }
    query = query.eq('business_id', businessId);
  }

  const { data: userPoints, error } = await query;

  if (error) {
    console.error('Error fetching user loyalty points:', error);
    if (error.code === '22P02') {
      return c.json({ error: 'Invalid business ID format' }, 400);
    }
    return c.json({ error: 'Error fetching loyalty points' }, 500);
  }

  if (businessId && userPoints.length === 0) {
    return c.json(
      { error: 'No loyalty points found for the specified business' },
      404
    );
  }

  return c.json({
    message: 'User loyalty points retrieved successfully',
    data: userPoints,
    user_id: userId,
  });
};

export const getUserCouponSpecificPoints = async (c: Context) => {
  try {
    const authUser = c.get('user');
    const businessId = c.req.param('businessId');

    if (!authUser || !authUser.id) {
      return sendErrorResponse(c, 'Not authenticated', 401);
    }

    if (!businessId) {
      return sendErrorResponse(c, 'Business ID is required', 400);
    }

    // First get all active coupons for the business
    const { data: businessCoupons, error: couponsError } = await supabase
      .from('coupons')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true);

    if (couponsError) {
      console.error('Error fetching business coupons:', couponsError);
      return sendErrorResponse(c, 'Error fetching business coupons', 500);
    }

    // Then get all coupon-specific points for the user
    const { data: userPoints, error: pointsError } = await supabase
      .from('coupon_specific_points')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('business_id', businessId);

    if (pointsError) {
      console.error('Error fetching user points:', pointsError);
      return sendErrorResponse(c, 'Error fetching user points', 500);
    }

    // Combine the data
    const couponsWithPoints = businessCoupons.map((coupon) => {
      const pointsEntry = userPoints.find((p) => p.coupon_id === coupon.id);
      return {
        ...coupon,
        current_points: pointsEntry?.points || 0,
        last_updated: pointsEntry?.last_updated || null,
      };
    });

    return sendSuccessResponse(
      c,
      {
        coupons: couponsWithPoints,
      },
      'Coupon points retrieved successfully'
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
