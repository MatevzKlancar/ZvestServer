import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { generateQRCode } from '../utils/qrCodeGenerator';
import { StatusCode } from 'hono/utils/http-status';
import { supabaseAdmin } from '../config/supabaseAdmin';

const handleError = (c: Context, error: any, statusCode: number = 500) => {
  console.error('Error:', error);
  return c.json(
    { error: error.message || 'An unexpected error occurred' },
    statusCode as StatusCode
  );
};

export const createCoupon = async (c: Context) => {
  try {
    const authUser = c.get('user');
    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = authUser.id;

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(ownerId);

    if (userError || !userData || !userData.user) {
      throw new Error('Error fetching user data');
    }

    const ownerUser = userData.user;

    if (ownerUser.user_metadata?.role !== 'Owner') {
      return c.json(
        { error: 'Access denied. Only owners can create coupons.' },
        403
      );
    }

    const formData = await c.req.formData();
    const image = formData.get('image') as File | null;
    const couponDataString = formData.get('couponData') as string;

    if (!couponDataString) {
      return c.json({ error: 'Coupon data is missing' }, 400);
    }

    const { name, description, pointsRequired } = JSON.parse(couponDataString);

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

    let imageUrl = null;
    if (image) {
      imageUrl = await uploadCouponImage(image, ownerId);
    }

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .insert({
        business_id: ownerUser.user_metadata?.business_id,
        name,
        description,
        points_required: pointsRequired,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (couponError) throw couponError;

    return c.json({ message: 'Coupon created successfully', coupon });
  } catch (error) {
    return handleError(c, error);
  }
};

// Add this helper function for uploading coupon images
async function uploadCouponImage(
  file: File,
  ownerId: string
): Promise<string | null> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${ownerId}-${Date.now()}.${fileExt}`;

  // Convert File to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from('coupon-images')
    .upload(fileName, uint8Array, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error('Error uploading coupon image:', uploadError);
    return null;
  }

  const { data } = supabaseAdmin.storage
    .from('coupon-images')
    .getPublicUrl(fileName);

  return data.publicUrl;
}

export const redeemCoupon = async (c: Context) => {
  const authUser = c.get('user');
  const { couponId } = await c.req.json();

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = authUser.id;

  if (!couponId) {
    return c.json({ error: 'Coupon ID is required' }, 400);
  }

  // Fetch the coupon and include the business_id
  const { data: coupon, error: couponError } = await supabase
    .from('coupons')
    .select('*, business_id, max_redemptions')
    .eq('id', couponId)
    .single();

  if (couponError) {
    console.error('Error fetching coupon:', couponError);
    return c.json({ error: 'Invalid coupon' }, 400);
  }

  if (!coupon) {
    return c.json({ error: 'Coupon not found' }, 404);
  }

  // Check if the coupon has reached its maximum redemptions
  if (coupon.max_redemptions !== null) {
    const { count, error: countError } = await supabase
      .from('redeemed_coupons')
      .select('*', { count: 'exact' })
      .eq('coupon_id', couponId);

    if (countError) {
      console.error('Error counting redemptions:', countError);
      return c.json({ error: 'Error checking coupon redemptions' }, 500);
    }

    if (count !== null && count >= coupon.max_redemptions) {
      return c.json({ error: 'Coupon has reached maximum redemptions' }, 400);
    }
  }

  // Insert the redeemed coupon
  const { data: redemption, error: insertError } = await supabase
    .from('redeemed_coupons')
    .insert({
      coupon_id: couponId,
      user_id: userId,
      business_id: coupon.business_id,
      redeemed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error redeeming coupon:', insertError);
    return c.json({ error: 'Error redeeming coupon' }, 500);
  }

  return c.json({
    message: 'Coupon redeemed successfully',
    redemption: redemption,
  });
};

export const verifyCoupon = async (c: Context) => {
  const authUser = c.get('user');
  const { qrCodeData } = await c.req.json();

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const staffUserId = authUser.id;

  // Check if the user is a staff member
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(staffUserId);

  if (userError || !userData || !userData.user) {
    return c.json({ error: 'Error fetching user data' }, 500);
  }

  const staffUser = userData.user;

  if (staffUser.user_metadata?.role !== 'Staff') {
    return c.json(
      { error: 'Access denied. Only staff members can verify coupons.' },
      403
    );
  }

  if (!qrCodeData) {
    return c.json(
      { error: 'Invalid input. Please provide QR code data.' },
      400
    );
  }

  // Parse the QR code data
  let redeemedCouponId: string;

  // Check if the qrCodeData is a valid UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(qrCodeData)) {
    redeemedCouponId = qrCodeData;
  } else {
    // If not a UUID, try the old format
    const parts = qrCodeData.split('-');
    if (parts.length !== 6) {
      return c.json({ error: 'Invalid QR code format' }, 400);
    }
    redeemedCouponId = parts.slice(0, 5).join('-'); // Reconstruct the UUID
  }

  // Verify the redeemed coupon
  const { data: redeemedCoupon, error: verifyError } = await supabase
    .from('redeemed_coupons')
    .select('*, coupons(*)')
    .eq('id', redeemedCouponId)
    .eq('business_id', staffUser.user_metadata?.business_id)
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

  if (redeemedCoupon.verified) {
    return c.json({ error: 'This coupon has already been verified' }, 400);
  }

  // Fetch user's current points
  const { data: userPoints, error: pointsError } = await supabase
    .from('loyalty_points')
    .select('points')
    .eq('user_id', redeemedCoupon.user_id)
    .eq('business_id', staffUser.user_metadata?.business_id)
    .single();

  if (pointsError) {
    console.error('Error fetching user points:', pointsError);
    return c.json({ error: 'Error fetching user points' }, 500);
  }

  const currentPoints = userPoints?.points || 0;
  const requiredPoints = redeemedCoupon.coupons.points_required;

  if (currentPoints < requiredPoints) {
    return c.json({ error: 'Insufficient points to redeem this coupon' }, 400);
  }

  // Deduct points
  const newPoints = currentPoints - requiredPoints;
  const { error: updatePointsError } = await supabase
    .from('loyalty_points')
    .update({ points: newPoints })
    .eq('user_id', redeemedCoupon.user_id)
    .eq('business_id', staffUser.user_metadata?.business_id);

  if (updatePointsError) {
    console.error('Error updating points:', updatePointsError);
    return c.json({ error: 'Error deducting points' }, 500);
  }

  // Mark the coupon as verified
  const { error: updateError } = await supabase
    .from('redeemed_coupons')
    .update({ verified: true, verified_at: new Date().toISOString() })
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
      points_deducted: requiredPoints,
    },
    business_id: staffUser.user_metadata?.business_id,
  });

  return c.json({
    message: 'Coupon verified and points deducted successfully',
    coupon: redeemedCoupon.coupons,
    pointsDeducted: requiredPoints,
    newPointsBalance: newPoints,
  });
};

export const getOwnerCoupons = async (c: Context) => {
  const authUser = c.get('user');

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const ownerId = authUser.id;

  // Check if the user is an owner and get business info
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(ownerId);

  if (userError || !userData || !userData.user) {
    return c.json({ error: 'Error fetching user data' }, 500);
  }

  const ownerUser = userData.user;

  if (ownerUser.user_metadata?.role !== 'Owner') {
    return c.json(
      { error: 'Access denied. Only owners can view their coupons.' },
      403
    );
  }

  // Fetch all coupons for the owner's business
  const { data: coupons, error: couponsError } = await supabase
    .from('coupons')
    .select('*')
    .eq('business_id', ownerUser.user_metadata?.business_id);

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
    const authUser = c.get('user');
    const couponId = c.req.param('couponId');

    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = authUser.id;

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(ownerId);

    if (userError || !userData || !userData.user) {
      throw new Error('Error fetching user data');
    }

    const ownerUser = userData.user;

    if (ownerUser.user_metadata?.role !== 'Owner') {
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
      .eq('business_id', ownerUser.user_metadata?.business_id)
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
