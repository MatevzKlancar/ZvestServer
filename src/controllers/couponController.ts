import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { generateQRCode } from '../utils/qrCodeGenerator';
import { StatusCode } from 'hono/utils/http-status';

const handleError = (c: Context, error: any, statusCode: number = 500) => {
  console.error('Error:', error);
  return c.json(
    { error: error.message || 'An unexpected error occurred' },
    statusCode as StatusCode
  );
};

export const createCoupon = async (c: Context) => {
  try {
    const user = c.get('user');
    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = user.sub;

    const { data: ownerData, error: ownerError } = await supabase
      .from('all_users')
      .select('user_id, business_id, role')
      .eq('user_id', ownerId)
      .single();

    if (ownerError) throw ownerError;
    if (ownerData.role !== 'Owner') {
      return c.json(
        { error: 'Access denied. Only owners can create coupons.' },
        403
      );
    }

    const { name, description, pointsRequired } = await c.req.json();

    if (
      !name ||
      !pointsRequired ||
      isNaN(pointsRequired) ||
      pointsRequired <= 0
    ) {
      return c.json(
        {
          error:
            'Invalid input. Please provide valid name and points required.',
        },
        400
      );
    }

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .insert({
        business_id: ownerData.business_id,
        name,
        description,
        points_required: pointsRequired,
      })
      .select()
      .single();

    if (couponError) throw couponError;

    return c.json({ message: 'Coupon created successfully', coupon });
  } catch (error) {
    return handleError(c, error);
  }
};

export const redeemCoupon = async (c: Context) => {
  try {
    const user = c.get('user');
    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const userId = user.sub;
    const { couponId } = await c.req.json();

    if (!couponId) {
      return c.json(
        { error: 'Invalid input. Please provide a valid coupon ID.' },
        400
      );
    }

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', couponId)
      .single();

    if (couponError) throw couponError;
    if (!coupon) {
      return c.json({ error: 'Coupon not found' }, 404);
    }

    const { data: loyaltyPoints, error: loyaltyError } = await supabase
      .from('loyalty_points')
      .select('points')
      .eq('user_id', userId)
      .eq('business_id', coupon.business_id)
      .single();

    if (loyaltyError) throw loyaltyError;
    if (!loyaltyPoints || loyaltyPoints.points < coupon.points_required) {
      return c.json(
        { error: 'Insufficient points to redeem this coupon' },
        400
      );
    }

    const { data: redeemedCoupon, error: redeemError } = await supabase.rpc(
      'redeem_coupon',
      {
        p_user_id: userId,
        p_coupon_id: couponId,
        p_points_required: coupon.points_required,
      }
    );

    if (redeemError) throw redeemError;

    const qrCodeData = `${redeemedCoupon.id}-${Date.now()}`;
    const qrCodeImage = await generateQRCode(qrCodeData);

    return c.json({
      message: 'Coupon redeemed successfully',
      redeemedCoupon,
      qrCode: qrCodeImage,
      qrCodeData,
    });
  } catch (error) {
    return handleError(c, error);
  }
};

export const verifyCoupon = async (c: Context) => {
  const user = c.get('user');

  if (!user || !user.sub) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const staffUserId = user.sub;

  // Check if the user is a staff member
  const { data: staffData, error: staffError } = await supabase
    .from('all_users')
    .select('user_id, business_id, role')
    .eq('user_id', staffUserId)
    .single();

  if (staffError || staffData.role !== 'Staff') {
    return c.json(
      { error: 'Access denied. Only staff members can verify coupons.' },
      403
    );
  }

  const { qrCodeData } = await c.req.json();

  if (!qrCodeData) {
    return c.json(
      { error: 'Invalid input. Please provide QR code data.' },
      400
    );
  }

  // Parse the QR code data
  const parts = qrCodeData.split('-');
  if (parts.length !== 6) {
    return c.json({ error: 'Invalid QR code format' }, 400);
  }

  const redeemedCouponId = parts.slice(0, 5).join('-'); // Reconstruct the UUID
  const timestamp = parts[5];

  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(redeemedCouponId)) {
    return c.json({ error: 'Invalid coupon ID format' }, 400);
  }

  // Verify the redeemed coupon
  const { data: redeemedCoupon, error: verifyError } = await supabase
    .from('redeemed_coupons')
    .select('*, coupons(*)')
    .eq('id', redeemedCouponId)
    .eq('business_id', staffData.business_id)
    .single();

  if (verifyError) {
    console.error('Error verifying coupon:', verifyError);
    return c.json(
      { error: 'Error verifying coupon', details: verifyError },
      500
    );
  }

  if (!redeemedCoupon) {
    return c.json(
      { error: 'Coupon not found or not associated with this business' },
      404
    );
  }

  if (redeemedCoupon.used) {
    return c.json({ error: 'This coupon has already been used' }, 400);
  }

  // Mark the coupon as used
  const { error: updateError } = await supabase
    .from('redeemed_coupons')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('id', redeemedCouponId);

  if (updateError) {
    console.error('Error updating coupon status:', updateError);
    return c.json(
      { error: 'Error updating coupon status', details: updateError },
      500
    );
  }

  // Log the staff action
  await supabase.from('staff_actions').insert({
    staff_user_id: staffUserId,
    action_type: 'VERIFY_COUPON',
    action_details: {
      coupon_id: redeemedCoupon.id,
      coupon_name: redeemedCoupon.coupons.name,
    },
    business_id: staffData.business_id,
  });

  return c.json({
    message: 'Coupon verified successfully',
    coupon: redeemedCoupon.coupons,
  });
};

export const getOwnerCoupons = async (c: Context) => {
  const user = c.get('user');

  if (!user || !user.sub) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const ownerId = user.sub;

  // Check if the user is an owner and get business info
  const { data: ownerData, error: ownerError } = await supabase
    .from('all_users')
    .select('user_id, business_id, role')
    .eq('user_id', ownerId)
    .single();

  if (ownerError || ownerData.role !== 'Owner') {
    return c.json(
      { error: 'Access denied. Only owners can view their coupons.' },
      403
    );
  }

  // Fetch all coupons for the owner's business
  const { data: coupons, error: couponsError } = await supabase
    .from('coupons')
    .select('*')
    .eq('business_id', ownerData.business_id);

  if (couponsError) {
    console.error('Error fetching coupons:', couponsError);
    return c.json({ error: 'Error fetching coupons' }, 500);
  }

  return c.json({
    message: 'Coupons fetched successfully',
    coupons,
  });
};

export const deleteCoupon = async (c: Context) => {
  try {
    const user = c.get('user');
    const couponId = c.req.param('couponId');

    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = user.sub;

    const { data: ownerData, error: ownerError } = await supabase
      .from('all_users')
      .select('user_id, business_id, role')
      .eq('user_id', ownerId)
      .single();

    if (ownerError) throw ownerError;
    if (ownerData.role !== 'Owner') {
      return c.json(
        { error: 'Access denied. Only owners can deactivate coupons.' },
        403
      );
    }

    if (!couponId) {
      return c.json(
        { error: 'Invalid input. Please provide a valid coupon ID.' },
        400
      );
    }

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', couponId)
      .eq('business_id', ownerData.business_id)
      .single();

    if (couponError) throw couponError;
    if (!coupon) {
      return c.json(
        { error: 'Coupon not found or not owned by this business' },
        404
      );
    }

    const { error: updateError } = await supabase
      .from('coupons')
      .update({ is_active: false })
      .eq('id', couponId);

    if (updateError) throw updateError;

    return c.json({
      message: 'Coupon deactivated successfully',
      deactivatedCouponId: couponId,
    });
  } catch (error) {
    return handleError(c, error);
  }
};
