import { Context } from 'hono';
import { supabase } from '../config/supabase';

export const getStaffActionHistory = async (c: Context) => {
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
      {
        error:
          'Access denied. Only staff members can view their action history.',
      },
      403
    );
  }

  // Fetch staff action history
  const { data: actionHistory, error: historyError } = await supabase
    .from('staff_actions')
    .select('*')
    .eq('staff_user_id', staffUserId)
    .order('performed_at', { ascending: false });

  if (historyError) {
    console.error('Error fetching staff action history:', historyError);
    return c.json({ error: 'Error fetching staff action history' }, 500);
  }

  return c.json({
    message: 'Staff action history retrieved successfully',
    data: actionHistory,
  });
};
