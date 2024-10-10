import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { randomUUID } from 'crypto';

export const awardLoyaltyPoints = async (c: Context) => {
  const user = c.get('user');

  if (!user || !user.sub) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const staffUserId = user.sub;

  // Check if the user is a staff member and get business info
  const { data: staffData, error: staffError } = await supabase
    .from('all_users')
    .select('user_id, business_id, role')
    .eq('user_id', staffUserId)
    .single();

  if (staffError || staffData.role !== 'Staff') {
    return c.json(
      { error: 'Access denied. Only staff members can award points/coupons.' },
      403
    );
  }

  // Get the QR code data and amount from the request body
  const { qrCodeData, amount } = await c.req.json();

  if (!qrCodeData || !amount || isNaN(amount) || amount <= 0) {
    return c.json(
      { error: 'Invalid input. Please provide valid QR code data and amount.' },
      400
    );
  }

  // Decode the QR code data to get the user ID and timestamp
  const lastHyphenIndex = qrCodeData.lastIndexOf('-');
  const userId = qrCodeData.substring(0, lastHyphenIndex);
  const timestamp = qrCodeData.substring(lastHyphenIndex + 1);

  console.log('Extracted userId:', userId);
  console.log('Extracted timestamp:', timestamp);

  // Verify if the QR code is valid and not expired
  const { data: qrCode, error: qrError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (qrError) {
    console.error('QR code fetch error:', qrError);
    if (qrError.code === 'PGRST116') {
      return c.json(
        { error: 'Invalid or expired QR code. No matching QR code found.' },
        400
      );
    }
    return c.json({ error: 'Error fetching QR code data' }, 500);
  }

  if (!qrCode) {
    return c.json(
      { error: 'Invalid or expired QR code. QR code not found.' },
      400
    );
  }

  console.log('Found QR code:', qrCode);

  // Get the business loyalty type
  const { data: businessData, error: businessError } = await supabase
    .from('businesses')
    .select('loyalty_type')
    .eq('id', staffData.business_id)
    .single();

  if (businessError) {
    return c.json({ error: 'Error fetching business data' }, 500);
  }

  let result;
  if (businessData.loyalty_type === 'POINTS') {
    // Award points
    const { data, error } = await supabase
      .from('loyalty_points')
      .insert({
        id: randomUUID(),
        user_id: userId,
        business_id: staffData.business_id,
        points: amount,
        awarded_by: staffData.user_id,
        awarded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return c.json({ error: 'Error awarding loyalty points' }, 500);
    }
    result = {
      message: 'Loyalty points awarded successfully',
      awarded: data.points,
    };

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
  } else if (businessData.loyalty_type === 'COUPONS') {
    // Award coupons
    const { data, error } = await supabase.rpc('increment_coupons', {
      p_user_id: userId,
      p_business_id: staffData.business_id,
      p_coupon_count: amount,
    });

    if (error) {
      return c.json({ error: 'Error awarding coupons' }, 500);
    }
    result = { message: 'Coupons awarded successfully', awarded: amount };
  } else {
    return c.json({ error: 'Invalid loyalty type for the business' }, 400);
  }

  return c.json(result);
};

export const getLoyaltyPointsInfo = async (c: Context) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const staffUserId = session.user.id;

  // Check if the user is a staff member or owner and get business info
  const { data: staffData, error: staffError } = await supabase
    .from('all_users')
    .select('user_id, business_id, role')
    .eq('user_id', staffUserId)
    .single();

  if (
    staffError ||
    (staffData.role !== 'Staff' && staffData.role !== 'Owner')
  ) {
    return c.json(
      {
        error:
          'Access denied. Only staff members or owners can view loyalty points information.',
      },
      403
    );
  }

  // Get loyalty points information for the business
  const { data: loyaltyPointsData, error: loyaltyPointsError } = await supabase
    .from('loyalty_points')
    .select(
      `
      id,
      user_id,
      points,
      awarded_by,
      awarded_at,
      customer:all_users!loyalty_points_user_id_fkey (
        email,
        role
      ),
      staff:all_users!loyalty_points_awarded_by_fkey (
        email,
        role
      )
    `
    )
    .eq('business_id', staffData.business_id)
    .order('awarded_at', { ascending: false });

  if (loyaltyPointsError) {
    console.error('Error fetching loyalty points data:', loyaltyPointsError);
    return c.json({ error: 'Error fetching loyalty points data' }, 500);
  }

  return c.json({
    message: 'Loyalty points information retrieved successfully',
    data: loyaltyPointsData,
  });
};
