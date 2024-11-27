import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { StatusCode } from 'hono/utils/http-status';
import { supabaseAdmin } from '../config/supabaseAdmin';
import CustomError from '../utils/customError';

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
    const stickerImage = formData.get('stickerImage') as File | null;
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
    let stickerImageUrl = null;

    if (image) {
      imageUrl = await uploadCouponImage(image, ownerId, 'regular');
    }

    if (stickerImage) {
      stickerImageUrl = await uploadCouponImage(
        stickerImage,
        ownerId,
        'sticker'
      );
    }

    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .insert({
        business_id: ownerUser.user_metadata?.business_id,
        name,
        description,
        points_required: pointsRequired,
        image_url: imageUrl,
        sticker_image_url: stickerImageUrl,
      })
      .select()
      .single();

    if (couponError) throw couponError;

    return c.json({ message: 'Coupon created successfully', coupon });
  } catch (error) {
    console.error('Error creating coupon:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

// Add this helper function for uploading coupon images
async function uploadCouponImage(
  file: File,
  ownerId: string,
  type: 'regular' | 'sticker'
): Promise<string | null> {
  const fileExt = file.name.split('.').pop();
  const prefix = type === 'sticker' ? 'stickers/' : 'regular/';
  const fileName = `${prefix}${ownerId}-${Date.now()}.${fileExt}`;

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
  try {
    const authUser = c.get('user');
    const { couponId } = await c.req.json();

    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const userId = authUser.id;

    if (!couponId) {
      return c.json({ error: 'Coupon ID is required' }, 400);
    }

    // Fetch the coupon details - specify the foreign key relationship
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select(
        `
        *,
        businesses!coupons_business_id_fkey (
          loyalty_type
        )
      `
      )
      .eq('id', couponId)
      .single();

    if (couponError) {
      console.error('Error fetching coupon:', couponError);
      return c.json({ error: 'Invalid coupon' }, 400);
    }

    if (!coupon) {
      return c.json({ error: 'Coupon not found' }, 404);
    }

    // Check if this is a coupon-specific points business
    if (coupon.businesses.loyalty_type === 'COUPONS') {
      // Check coupon-specific points
      const { data: specificPoints, error: pointsError } = await supabase
        .from('coupon_specific_points')
        .select('points')
        .eq('user_id', userId)
        .eq('business_id', coupon.business_id)
        .eq('coupon_id', couponId)
        .single();

      if (pointsError) {
        console.error('Error fetching coupon points:', pointsError);
        return c.json({ error: 'Error fetching points' }, 500);
      }

      const currentPoints = specificPoints?.points || 0;
      if (currentPoints < coupon.points_required) {
        return c.json(
          {
            error: 'Insufficient points to redeem this coupon',
            required: coupon.points_required,
            current: currentPoints,
          },
          400
        );
      }

      // Calculate remaining points after redemption
      const remainingPoints = currentPoints - coupon.points_required;

      // Update points with remaining amount instead of resetting to 0
      const { error: updatePointsError } = await supabase
        .from('coupon_specific_points')
        .update({
          points: remainingPoints,
          last_updated: new Date().toISOString(),
          operation_type_add: 0,  // 0 for point reduction
          last_action_points: coupon.points_required  // Amount of points being deducted
        })
        .eq('user_id', userId)
        .eq('business_id', coupon.business_id)
        .eq('coupon_id', couponId);

      if (updatePointsError) {
        console.error('Error updating points:', updatePointsError);
        return c.json({ error: 'Error deducting points' }, 500);
      }
    } else {
      // Original loyalty points logic
      const { data: userPoints, error: pointsError } = await supabase
        .from('user_loyalty_points')
        .select('total_points')
        .eq('user_id', userId)
        .eq('business_id', coupon.business_id)
        .single();

      if (pointsError) {
        console.error('Error fetching user points:', pointsError);
        return c.json({ error: 'Error fetching user points' }, 500);
      }

      const currentPoints = userPoints?.total_points || 0;
      if (currentPoints < coupon.points_required) {
        return c.json(
          { error: 'Insufficient points to redeem this coupon' },
          400
        );
      }

      // Deduct points
      const { error: updateError } = await supabase
        .from('user_loyalty_points')
        .update({ total_points: currentPoints - coupon.points_required,  operation_type_add: 0, last_action_points: coupon.points_required }) 
        .eq('user_id', userId)
        .eq('business_id', coupon.business_id);

      if (updateError) {
        console.error('Error updating points:', updateError);
        return c.json({ error: 'Error deducting points' }, 500);
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
  } catch (error) {
    console.error('Error redeeming coupon:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const verifyCoupon = async (c: Context) => {
  try {
    const authUser = c.get('user');
    const { redeemedCouponId } = await c.req.json();

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

    if (!['Staff', 'Owner'].includes(staffUser.user_metadata?.role)) {
      return c.json(
        {
          error:
            'Access denied. Only staff members and owners can verify coupons.',
        },
        403
      );
    }

    if (!redeemedCouponId) {
      return c.json({ error: 'Redeemed coupon ID is required' }, 400);
    }

    // Verify the redeemed coupon
    const { data: redeemedCoupon, error: verifyError } = await supabase
      .from('redeemed_coupons')
      .select(
        `
        *,
        coupons (
          id,
          name,
          points_required,
          business_id
        )
      `
      )
      .eq('id', redeemedCouponId)
      .eq('business_id', staffUser.user_metadata?.business_id)
      .single();

    if (verifyError || !redeemedCoupon) {
      console.error('Error verifying coupon:', verifyError);
      return c.json(
        { error: 'Coupon not found or not associated with this business' },
        404
      );
    }

    if (redeemedCoupon.verified) {
      return c.json({ error: 'This coupon has already been verified' }, 400);
    }

    // Check if the coupon is still valid (within 5 minutes)
    const redeemedAt = new Date(redeemedCoupon.redeemed_at);
    const now = new Date();
    const diffInMinutes = (now.getTime() - redeemedAt.getTime()) / (1000 * 60);

    if (diffInMinutes > 5) {
      return c.json({ error: 'This coupon has expired' }, 400);
    }

    // Mark the coupon as verified
    const { error: updateError } = await supabase
      .from('redeemed_coupons')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
      })
      .eq('id', redeemedCouponId);

    if (updateError) {
      console.error('Error updating coupon status:', updateError);
      return c.json({ error: 'Error updating coupon status' }, 500);
    }

    // Log the staff action
    await supabase.from('staff_actions').insert({
      staff_user_id: staffUserId,
      action_type: 'VERIFY_COUPON',
      action_details: {
        coupon_id: redeemedCoupon.coupon_id,
        coupon_name: redeemedCoupon.coupons.name,
      },
      business_id: staffUser.user_metadata?.business_id,
    });

    return c.json({
      message: 'Coupon verified successfully',
      coupon: redeemedCoupon.coupons,
    });
  } catch (error) {
    console.error('Error verifying coupon:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const getOwnerCoupons = async (c: Context) => {
  try {
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

    if (
      ownerUser.user_metadata?.role !== 'Owner' &&
      ownerUser.user_metadata?.role !== 'Staff'
    ) {
      return c.json(
        {
          error: 'Access denied. Only owners and staff can view their coupons.',
        },
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
  } catch (error) {
    console.error('Error fetching owner coupons:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
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
    console.error('Error deactivating coupon:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const getBusinessCoupons = async (c: Context) => {
  try {
    const authUser = c.get('user');
    const businessId = c.req.param('businessId');

    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    if (!businessId) {
      return c.json({ error: 'Business ID is required' }, 400);
    }

    // Fetch active coupons for the specified business
    const { data: coupons, error: couponsError } = await supabase
      .from('coupons')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true);

    if (couponsError) {
      console.error('Error fetching coupons:', couponsError);
      return c.json({ error: 'Error fetching coupons' }, 500);
    }

    return c.json({
      message: 'Coupons fetched successfully',
      coupons,
    });
  } catch (error) {
    console.error('Error fetching business coupons:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const getPublicBusinessCoupons = async (c: Context) => {
  try {
    const businessId = c.req.param('businessId');

    if (!businessId) {
      return c.json({ error: 'Business ID is required' }, 400);
    }

    // Fetch active coupons for the specified business
    const { data: coupons, error: couponsError } = await supabase
      .from('coupons')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true);

    if (couponsError) {
      console.error('Error fetching coupons:', couponsError);
      return c.json({ error: 'Error fetching coupons' }, 500);
    }

    return c.json({
      message: 'Coupons fetched successfully',
      coupons,
    });
  } catch (error) {
    console.error('Error fetching public business coupons:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const getRedeemedCoupon = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    // Get the user's most recent unverified redeemed coupon
    const { data: redeemedCoupon, error: fetchError } = await supabase
      .from('redeemed_coupons')
      .select(
        `
        *,
        coupons (
          name,
          points_required,
          image_url,
          sticker_image_url
        )
      `
      )
      .eq('user_id', authUser.id)
      .eq('verified', false)
      .order('redeemed_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !redeemedCoupon) {
      return c.json(
        {
          message: 'No active redeemed coupon found',
          redeemedCoupon: null,
        },
        200
      );
    }

    // Check if the coupon is still valid (within 5 minutes)
    const redeemedAt = new Date(redeemedCoupon.redeemed_at);
    const now = new Date();
    const diffInMinutes = (now.getTime() - redeemedAt.getTime()) / (1000 * 60);

    if (diffInMinutes > 5) {
      return c.json(
        {
          message: 'No active redeemed coupon found',
          redeemedCoupon: null,
        },
        200
      );
    }

    return c.json({
      message: 'Redeemed coupon retrieved successfully',
      redeemedCoupon,
    });
  } catch (error) {
    console.error('Error getting redeemed coupon:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};
