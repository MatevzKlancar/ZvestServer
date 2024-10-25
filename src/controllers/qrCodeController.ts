import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { awardLoyaltyPoints } from './loyaltyController';
import { verifyCoupon } from './couponController';
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

    if (staffUser.user_metadata?.role !== 'Staff') {
      throw new CustomError(
        'Access denied. Only staff members can scan QR codes.',
        403
      );
    }

    const { qrCodeData, amount } = await c.req.json();

    if (!qrCodeData) {
      throw new CustomError('Invalid input. Please provide QR code data.', 400);
    }

    // Verify and mark QR code as used
    const { data: qrCode, error: qrCodeError } = await supabase
      .from('qr_codes')
      .update({ used: true })
      .eq('qr_data', qrCodeData)
      .eq('used', false)
      .select()
      .single();

    if (qrCodeError || !qrCode) {
      throw new CustomError('Invalid or already used QR code.', 400);
    }

    // Check if amount is provided to determine the action
    if (amount !== undefined) {
      // This is a loyalty points action
      if (isNaN(amount) || amount <= 0) {
        throw new CustomError(
          'Invalid input. Please provide a valid amount for loyalty points.',
          400
        );
      }
      return awardLoyaltyPoints(c);
    } else {
      // This is a coupon verification action
      return verifyCoupon(c);
    }
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
