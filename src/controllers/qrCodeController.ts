import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { awardLoyaltyPoints } from './loyaltyController';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';
import { supabaseAdmin } from '../config/supabaseAdmin';

export const getQRCode = async (c: Context) => {
  const authUser = c.get('user');

  if (!authUser || !authUser.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = authUser.id;

  // Check user role
  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (userError || !userData || !userData.user) {
    return c.json({ error: 'Error fetching user data' }, 500);
  }

  const user = userData.user;

  if (user.user_metadata?.role !== 'Client') {
    return c.json(
      { error: 'Access denied. Only clients can access QR codes.' },
      403
    );
  }

  // Check for existing unused QR code
  const { data: existingQRCode, error: fetchError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('user_id', userId)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    return c.json({ error: 'Error fetching QR code' }, 500);
  }

  let qrCode;

  if (existingQRCode) {
    qrCode = existingQRCode;
  } else {
    const uniqueIdentifier = `${userId}-${Date.now()}`;

    const { data: newQRCode, error: insertError } = await supabase
      .from('qr_codes')
      .insert({
        user_id: userId,
        qr_data: uniqueIdentifier,
        used: false,
      })
      .select()
      .single();

    if (insertError) {
      return c.json({ error: 'Error creating QR code' }, 500);
    }

    qrCode = newQRCode;
  }

  return c.json({
    qrCode: {
      id: qrCode.id,
      data: qrCode.qr_data,
      createdAt: qrCode.created_at,
    },
  });
};

export const handleQRCode = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const staffUserId = authUser.id;

    // Check if the user is a staff member
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(staffUserId);

    if (userError || !userData || !userData.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const staffUser = userData.user;
    const staffBusinessId = staffUser.user_metadata?.business_id;

    if (!['Staff', 'Owner'].includes(staffUser.user_metadata?.role)) {
      throw new CustomError(
        'Access denied. Only staff members and owners can scan QR codes.',
        403
      );
    }

    const { qrCodeData, amount } = await c.req.json();

    if (!qrCodeData) {
      throw new CustomError('Invalid input. Please provide QR code data.', 400);
    }

    // Check if amount is provided to determine the action
    if (amount !== undefined) {
      // Check if it's a coupon QR code
      const { data: couponCheck } = await supabase
        .from('redeemed_coupons')
        .select('id')
        .eq('id', qrCodeData)
        .single();

      if (couponCheck) {
        throw new CustomError(
          'Invalid QR code type. Points can only be added using a profile QR code. This appears to be a coupon QR code.',
          400
        );
      }

      // Check qr_codes table
      const { data: qrCode, error: qrCodeError } = await supabase
        .from('qr_codes')
        .update({ used: true })
        .eq('qr_data', qrCodeData)
        .eq('used', false)
        .select()
        .single();

      if (qrCodeError || !qrCode) {
        throw new CustomError(
          'Invalid or already used profile QR code. Please generate a new one.',
          400
        );
      }

      if (isNaN(amount) || amount <= 0) {
        throw new CustomError(
          'Invalid input. Please provide a valid amount for loyalty points.',
          400
        );
      }
      return awardLoyaltyPoints(c);
    } else {
      // This is a coupon verification - check if it's a profile QR code first
      const { data: profileCheck } = await supabase
        .from('qr_codes')
        .select('id')
        .eq('qr_data', qrCodeData)
        .single();

      if (profileCheck) {
        throw new CustomError(
          'Invalid QR code type. Coupons can only be verified using a coupon QR code. This appears to be a profile QR code.',
          400
        );
      }

      // Check redeemed_coupons table
      const { data: redeemedCoupon, error: couponError } = await supabase
        .from('redeemed_coupons')
        .select('*, coupons(*)')
        .eq('id', qrCodeData)
        .eq('verified', false)
        .single();

      if (couponError || !redeemedCoupon) {
        throw new CustomError('Invalid or already verified coupon.', 400);
      }

      // Check if the coupon belongs to the staff member's business
      if (redeemedCoupon.business_id !== staffBusinessId) {
        throw new CustomError(
          'Access denied. You can only verify coupons for your business.',
          403
        );
      }

      // Update the redeemed_coupon to mark it as verified
      const { error: updateError } = await supabase
        .from('redeemed_coupons')
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('id', qrCodeData);

      if (updateError) {
        throw new CustomError('Error updating coupon status.', 500);
      }

      return sendSuccessResponse(c, {
        message: 'Coupon verified successfully',
        couponId: redeemedCoupon.coupon_id,
      });
    }
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
