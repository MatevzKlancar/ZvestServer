import { Context } from 'hono';
import { supabaseAdmin } from '../config/supabaseAdmin';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';

export const getEmployees = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    // Check if user is owner or staff
    const { data: userData, error: userError } = 
      await supabaseAdmin.auth.admin.getUserById(authUser.id);

    if (userError || !userData?.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const businessId = userData.user.user_metadata?.business_id;
    const userRole = userData.user.user_metadata?.role;

    if (!businessId || !['Owner', 'Staff'].includes(userRole)) {
      throw new CustomError('Access denied or invalid business', 403);
    }

    // Fetch employees for the business
    const { data: employees, error: fetchError } = await supabaseAdmin
      .from('employees')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw new CustomError('Error fetching employees', 500);
    }

    return sendSuccessResponse(
      c,
      { employees },
      'Employees retrieved successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

// Helper function to generate employee ID
const generateEmployeeId = (businessName: string, count: number) => {
  const prefix = businessName.substring(0, 3).toUpperCase();
  const paddedCount = count.toString().padStart(4, '0');
  return `${prefix}${paddedCount}`;
};

export const addEmployee = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    // Check if user is owner
    const { data: userData, error: userError } = 
      await supabaseAdmin.auth.admin.getUserById(authUser.id);

    if (userError || !userData?.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const businessId = userData.user.user_metadata?.business_id;
    const userRole = userData.user.user_metadata?.role;
    const businessName = userData.user.user_metadata?.business_name;

    if (!businessId || userRole !== 'Owner') {
      throw new CustomError('Access denied. Only owners can add employees', 403);
    }

    const { name } = await c.req.json();

    if (!name) {
      throw new CustomError('Employee name is required', 400);
    }

    // Get current count of employees for this business
    const { count, error: countError } = await supabaseAdmin
      .from('employees')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId);

    if (countError) {
      throw new CustomError('Error counting employees', 500);
    }

    // Generate unique employee ID
    const employeeId = generateEmployeeId(businessName || 'BIZ', (count || 0) + 1);

    // Create new employee
    const { data: employee, error: createError } = await supabaseAdmin
      .from('employees')
      .insert({
        business_id: businessId,
        name,
        employee_id: employeeId,
      })
      .select()
      .single();

    if (createError) {
      throw new CustomError('Error creating employee', 500);
    }

    return sendSuccessResponse(
      c,
      { employee },
      'Employee added successfully',
      201
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const removeEmployee = async (c: Context) => {
  try {
    const authUser = c.get('user');
    const employeeId = c.req.param('id');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    // Check if user is owner
    const { data: userData, error: userError } = 
      await supabaseAdmin.auth.admin.getUserById(authUser.id);

    if (userError || !userData?.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const businessId = userData.user.user_metadata?.business_id;
    const userRole = userData.user.user_metadata?.role;

    if (!businessId || userRole !== 'Owner') {
      throw new CustomError('Access denied. Only owners can remove employees', 403);
    }

    // Delete employee
    const { error: deleteError } = await supabaseAdmin
      .from('employees')
      .delete()
      .eq('id', employeeId)
      .eq('business_id', businessId); // Ensure employee belongs to this business

    if (deleteError) {
      throw new CustomError('Error removing employee', 500);
    }

    return sendSuccessResponse(
      c,
      {},
      'Employee removed successfully'
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
}; 