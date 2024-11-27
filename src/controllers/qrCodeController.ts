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
    const { qrCodeData, amount, couponId } = await c.req.json();

    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    // Fetch complete user data from Supabase Admin
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(authUser.id);

    if (userError || !userData || !userData.user) {
      console.error('Error fetching user data:', userError);
      return c.json({ error: 'Error fetching user data' }, 500);
    }

    const staffUser = userData.user;

    // Add debug logs
    console.log('Staff User:', {
      id: staffUser.id,
      metadata: staffUser.user_metadata,
      role: staffUser.user_metadata?.role,
      businessId: staffUser.user_metadata?.business_id,
    });

    const staffBusinessId = staffUser.user_metadata?.business_id;

    console.log('Staff Business ID:', staffBusinessId);
    console.log('Request payload:', { qrCodeData, amount, couponId });

    if (!staffBusinessId) {
      return c.json(
        { error: 'Staff user is not associated with a business' },
        400
      );
    }

    if (!qrCodeData || !amount || amount <= 0) {
      return c.json(
        {
          error: 'Invalid input. Please provide valid QR code data and amount.',
        },
        400
      );
    }

    // Get business type
    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('loyalty_type')
      .eq('id', staffBusinessId)
      .single();

    if (businessError) {
      console.error('Business fetch error:', businessError);
      return c.json({ error: 'Error fetching business data' }, 500);
    }

    // Handle points based on business type
    if (businessData.loyalty_type === 'COUPONS') {
      if (!couponId) {
        return c.json(
          { error: 'Coupon ID is required for coupon-specific points' },
          400
        );
      }

      // Check qr_codes table
      const { data: qrCode, error: qrCodeError } = await supabase
        .from('qr_codes')
        .select('user_id')
        .eq('qr_data', qrCodeData)
        .eq('used', false)
        .single();

      if (qrCodeError || !qrCode) {
        throw new CustomError(
          'Invalid or already used QR code. Please generate a new one.',
          400
        );
      }

      // Update or create coupon-specific points
      const { data: existingPoints, error: pointsError } = await supabase
        .from('coupon_specific_points')
        .select('points')
        .eq('user_id', qrCode.user_id)
        .eq('business_id', staffBusinessId)
        .eq('coupon_id', couponId)
        .maybeSingle();

      if (pointsError) {
        console.error('Error checking existing points:', pointsError);
        throw new CustomError('Error checking points', 500);
      }

      let newPoints = amount;
      if (existingPoints) {
        // If points exist, add to them
        newPoints = existingPoints.points + amount;

        const { error: updateError } = await supabase
          .from('coupon_specific_points')
          .update({
            points: newPoints,
            last_updated: new Date().toISOString(),
            operation_type_add: 1,
            last_action_points: amount
          })
          .eq('user_id', qrCode.user_id)
          .eq('business_id', staffBusinessId)
          .eq('coupon_id', couponId);

        if (updateError) {
          throw new CustomError('Error updating points', 500);
        }
      } else {
        // If no points exist, create new record
        const { error: insertError } = await supabase
          .from('coupon_specific_points')
          .insert({
            user_id: qrCode.user_id,
            business_id: staffBusinessId,
            coupon_id: couponId,
            points: newPoints,
            last_updated: new Date().toISOString(),
            operation_type_add: 1,
            last_action_points: amount
          });

        if (insertError) {
          throw new CustomError('Error creating points record', 500);
        }
      }

      // Mark QR code as used
      await supabase
        .from('qr_codes')
        .update({ used: true })
        .eq('qr_data', qrCodeData);

      return sendSuccessResponse(c, {
        message: 'Points added successfully',
        currentPoints: newPoints,
      });
    } else {
      // Handle regular loyalty points
      try {
        const { data: qrCode, error: qrCodeError } = await supabase
          .from('qr_codes')
          .select('user_id')
          .eq('qr_data', qrCodeData)
          .eq('used', false)
          .single();

        console.log('QR Code lookup result:', { qrCode, qrCodeError });

        if (qrCodeError || !qrCode) {
          throw new CustomError(
            'Invalid or already used QR code. Please generate a new one.',
            400
          );
        }

        // Update or create loyalty points
        const { data: existingPoints, error: pointsError } = await supabase
          .from('user_loyalty_points')
          .select('total_points')
          .eq('user_id', qrCode.user_id)
          .eq('business_id', staffBusinessId)
          .maybeSingle();

        console.log('Existing points lookup:', { existingPoints, pointsError });

        if (pointsError) {
          console.error('Error checking loyalty points:', pointsError);
          throw new CustomError('Error checking loyalty points', 500);
        }

        const currentPoints = existingPoints?.total_points || 0;
        const newPoints = currentPoints + amount;

        console.log('Points calculation:', {
          currentPoints,
          amount,
          newPoints,
          userId: qrCode.user_id,
          businessId: staffBusinessId,
        });

        // If points exist, update them
        if (existingPoints) {
          const { error: updateError } = await supabase
            .from('user_loyalty_points')
            .update({
              total_points: newPoints,
              last_updated: new Date().toISOString(),
              operation_type_add: 1,  // 1 for adding points
              last_action_points: amount
            })
            .eq('user_id', qrCode.user_id)
            .eq('business_id', staffBusinessId);

          if (updateError) {
            console.error('Update error:', updateError);
            throw new CustomError('Error updating loyalty points', 500);
          }
        } else {
          // If no points exist, insert new record
          const { error: insertError } = await supabase
            .from('user_loyalty_points')
            .insert({
              user_id: qrCode.user_id,
              business_id: staffBusinessId,
              total_points: newPoints,
              last_updated: new Date().toISOString(),
              operation_type_add: 1,  // 1 for adding points
              last_action_points: amount
            });

          if (insertError) {
            console.error('Insert error:', insertError);
            throw new CustomError('Error creating points record', 500);
          }
        }

        // Log the points transaction in loyalty_points table
        const { error: loyaltyLogError } = await supabase
          .from('loyalty_points')
          .insert({
            user_id: qrCode.user_id,
            business_id: staffBusinessId,
            points: amount,
            awarded_by: staffUser.id,
            awarded_at: new Date().toISOString(),
            operation_type_add: 1,
          });

        if (loyaltyLogError) {
          console.error('Error logging loyalty points:', loyaltyLogError);
          throw new CustomError(
            'Error logging loyalty points transaction',
            500
          );
        }

        // Log the staff action
        const { error: staffActionError } = await supabase
          .from('staff_actions')
          .insert({
            staff_user_id: staffUser.id,
            action_type: 'AWARD_POINTS',
            action_details: {
              points_awarded: amount,
              recipient_user_id: qrCode.user_id,
            },
            business_id: staffBusinessId,
          });

        if (staffActionError) {
          console.error('Error logging staff action:', staffActionError);
          throw new CustomError('Error logging staff action', 500);
        }

        // Mark QR code as used
        const { error: markUsedError } = await supabase
          .from('qr_codes')
          .update({ used: true })
          .eq('qr_data', qrCodeData);

        if (markUsedError) {
          console.error('Error marking QR code as used:', markUsedError);
          throw new CustomError('Error marking QR code as used', 500);
        }

        return sendSuccessResponse(c, {
          message: 'Points added successfully',
          currentPoints: newPoints,
        });
      } catch (error) {
        console.error('Detailed error in points handling:', error);
        throw error;
      }
    }
  } catch (error) {
    console.error('Error handling QR code:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};
