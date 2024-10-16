import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { randomUUID } from 'crypto';

export const awardLoyaltyPoints = async (c: Context) => {
  const user = c.get('user');
  const { qrCodeData, amount } = await c.req.json();

  console.log('Received Loyalty QR Code Data:', qrCodeData);
  console.log('Received Loyalty Points Amount:', amount);

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
      { error: 'Access denied. Only staff members can award points.' },
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
  const { data: userData, error: userError } = await supabase
    .from('all_users')
    .select('user_id')
    .eq('user_id', userId)
    .single();

  if (userError || !userData) {
    console.error('Error fetching user data:', userError);
    return c.json({ error: 'Invalid or non-existent user.' }, 400);
  }

  // Award points
  const { data, error } = await supabase
    .from('loyalty_points')
    .insert({
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
    awarded: data.points,
  });
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
