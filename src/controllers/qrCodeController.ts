import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { generateQRCode } from '../utils/qrCodeGenerator';
import { awardLoyaltyPoints } from './loyaltyController';
import { verifyCoupon } from './couponController';

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

  // Rest of the existing code for QR code fetching/generation
  const { data: existingQRCode, error: fetchError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
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
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000); // 10 minutes from now

    const uniqueIdentifier = `${userId}-${createdAt.getTime()}`;
    const qrCodeData = await generateQRCode(uniqueIdentifier);
    const base64Data = qrCodeData.split(',')[1];

    const { data: newQRCode, error: insertError } = await supabase
      .from('qr_codes')
      .insert({
        user_id: userId,
        qr_data: base64Data,
        created_at: createdAt.toISOString(),
        expires_at: expiresAt.toISOString(),
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
      format: 'png',
      encoding: 'base64',
      createdAt: qrCode.created_at,
      expiresAt: qrCode.expires_at,
    },
  });
};

export const handleQRCode = async (c: Context) => {
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
      { error: 'Access denied. Only staff members can scan QR codes.' },
      403
    );
  }

  const { qrCodeData, amount } = await c.req.json();

  console.log('Received QR Code Data:', qrCodeData);
  console.log('Received Amount:', amount);

  if (!qrCodeData) {
    return c.json(
      { error: 'Invalid input. Please provide QR code data.' },
      400
    );
  }

  // Check if amount is provided to determine the action
  if (amount !== undefined) {
    // This is a loyalty points action
    if (isNaN(amount) || amount <= 0) {
      return c.json(
        {
          error:
            'Invalid input. Please provide a valid amount for loyalty points.',
        },
        400
      );
    }
    return awardLoyaltyPoints(c);
  } else {
    // This is a coupon verification action
    if (!qrCodeData.includes('-')) {
      return c.json(
        { error: 'Invalid QR code format for coupon verification.' },
        400
      );
    }
    return verifyCoupon(c);
  }
};
