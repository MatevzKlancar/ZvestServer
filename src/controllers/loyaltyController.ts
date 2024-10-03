import { Context } from 'hono';
import { supabase } from '../config/supabase';
import { randomUUID } from 'crypto';

export const awardLoyaltyPoints = async (c: Context) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const staffUserId = session.user.id;

  // Check if the user is a staff member
  const { data: staffData, error: staffError } = await supabase
    .from('all_users')
    .select('role, business_id')
    .eq('user_id', staffUserId)
    .single();

  if (staffError || staffData.role !== 'Staff') {
    return c.json(
      { error: 'Access denied. Only staff members can award points.' },
      403
    );
  }

  // Get the QR code data and points from the request body
  const { qrCodeData, points } = await c.req.json();

  if (!qrCodeData || !points || isNaN(points) || points <= 0) {
    return c.json(
      { error: 'Invalid input. Please provide valid QR code data and points.' },
      400
    );
  }

  // Decode the QR code data to get the user ID
  const [userId, timestamp] = qrCodeData.split('-');

  // Verify if the QR code is valid and not expired
  const { data: qrCode, error: qrError } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (qrError || !qrCode) {
    return c.json({ error: 'Invalid or expired QR code.' }, 400);
  }

  // Award points to the user
  const { data: loyaltyData, error: loyaltyError } = await supabase
    .from('loyalty_points')
    .insert({
      id: randomUUID(),
      user_id: userId,
      business_id: staffData.business_id,
      points: points,
      awarded_by: staffUserId,
      awarded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (loyaltyError) {
    return c.json({ error: 'Error awarding loyalty points' }, 500);
  }

  return c.json({
    message: 'Loyalty points awarded successfully',
    awardedPoints: loyaltyData.points,
    totalPoints: loyaltyData.points, // You might want to calculate the total points for the user here
  });
};

// You can add more loyalty-related functions here in the future
