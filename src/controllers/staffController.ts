import { Context } from 'hono';
import { supabase } from '../config/supabase';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';
import { supabaseAdmin } from '../config/supabaseAdmin';

export const getStaffActionHistory = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const userId = authUser.id;

    // Check if the user is a staff member or owner
    const { data: userData, error: fetchUserError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (fetchUserError || !userData || !userData.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const user = userData.user;
    const userRole = user.user_metadata?.role;
    const businessId = user.user_metadata?.business_id;

    if (!['Staff', 'Owner'].includes(userRole)) {
      throw new CustomError(
        'Access denied. Only staff members and owners can view action history.',
        403
      );
    }

    let query = supabase.from('staff_actions').select('*');

    // If user is staff, only show their actions
    if (userRole === 'Staff') {
      query = query.eq('staff_user_id', userId);
    } else {
      // If user is owner, show all staff actions for their business
      query = query.eq('business_id', businessId);
    }

    const { data: actionHistory, error: historyError } = await query.order(
      'performed_at',
      { ascending: false }
    );

    if (historyError) {
      console.error('Error fetching staff action history:', historyError);
      throw new CustomError('Error fetching staff action history', 500);
    }

    return sendSuccessResponse(
      c,
      { data: actionHistory },
      'Staff action history retrieved successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const getStaffMembers = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const userId = authUser.id;

    // Check if the user is an owner
    const { data: userData, error: fetchUserError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (fetchUserError || !userData || !userData.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const ownerUser = userData.user;

    if (ownerUser.user_metadata?.role !== 'Owner') {
      throw new CustomError(
        'Access denied. Only owners can view staff members.',
        403
      );
    }

    const businessId = ownerUser.user_metadata?.business_id;

    if (!businessId) {
      throw new CustomError('Business ID not found for the owner', 500);
    }

    // Fetch staff members
    const { data: staffMembers, error: staffError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (staffError) {
      console.error('Error fetching staff members:', staffError);
      throw new CustomError('Error fetching staff members', 500);
    }

    // Filter staff members for the specific business
    const businessStaff = staffMembers.users
      .filter(
        (user) =>
          user.user_metadata?.business_id === businessId &&
          user.user_metadata?.role === 'Staff'
      )
      .map((user) => ({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name,
        surname: user.user_metadata?.surname,
        created_at: user.created_at,
      }));

    return sendSuccessResponse(
      c,
      { data: businessStaff },
      'Staff members retrieved successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const removeStaffMember = async (c: Context) => {
  try {
    const authUser = c.get('user');
    const { staffId } = await c.req.json();

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const ownerId = authUser.id;

    // Check if the user is an owner
    const { data: ownerData, error: ownerError } =
      await supabaseAdmin.auth.admin.getUserById(ownerId);

    if (ownerError || !ownerData || !ownerData.user) {
      throw new CustomError('Error fetching owner data', 500);
    }

    const ownerUser = ownerData.user;

    if (ownerUser.user_metadata?.role !== 'Owner') {
      throw new CustomError(
        'Access denied. Only owners can remove staff members.',
        403
      );
    }

    const businessId = ownerUser.user_metadata?.business_id;

    if (!businessId) {
      throw new CustomError('Business ID not found for the owner', 500);
    }

    // Check if the staff member belongs to the owner's business
    const { data: staffData, error: staffError } =
      await supabaseAdmin.auth.admin.getUserById(staffId);

    if (staffError || !staffData || !staffData.user) {
      throw new CustomError('Error fetching staff data', 500);
    }

    const staffUser = staffData.user;

    if (
      staffUser.user_metadata?.business_id !== businessId ||
      staffUser.user_metadata?.role !== 'Staff'
    ) {
      throw new CustomError(
        'Invalid staff member or not associated with your business',
        400
      );
    }

    // Remove the staff member's association with the business
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      staffId,
      {
        user_metadata: {
          business_id: null,
          role: null,
        },
      }
    );

    if (updateError) {
      throw new CustomError('Error removing staff member', 500);
    }

    return sendSuccessResponse(c, {}, 'Staff member removed successfully');
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
