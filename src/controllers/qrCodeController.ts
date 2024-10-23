import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { awardLoyaltyPoints } from './loyaltyController';
import { verifyCoupon } from './couponController';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';

export const getQRCode = async (c: Context) => {
  const user = c.get('user');

  if (!user || !user.sub) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = user.sub;

  // Check user role
  const { data: userData, error: userError } = await supabase
    .from('all_users')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (userError) {
    return c.json({ error: 'Error fetching user data' }, 500);
  }

  if (userData.role !== 'Client') {
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
    const user = c.get('user');

    if (!user || !user.sub) {
      throw new CustomError('Not authenticated', 401);
    }

    const staffUserId = user.sub;

    // Check if the user is a staff member
    const { data: staffData, error: staffError } = await supabase
      .from('all_users')
      .select('user_id, business_id, role')
      .eq('user_id', staffUserId)
      .single();

    if (staffError || staffData.role !== 'Staff') {
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
