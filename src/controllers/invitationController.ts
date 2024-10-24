import { Context } from 'hono';
import { supabase } from '../config/supabase';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabaseAdmin';

interface Business {
  name: string;
}

interface OwnerData {
  user_id: string;
  business_id: string;
  role: string;
  businesses: Business;
}

export const createInvitation = async (c: Context) => {
  try {
    const user = c.get('user');
    const { email } = await c.req.json();

    if (!user || !user.sub) {
      throw new CustomError('Not authenticated', 401);
    }

    const ownerId = user.sub;

    // Check if the user is an owner and get their business
    const { data: ownerData, error: ownerError } = (await supabase
      .from('all_users')
      .select(
        `
        user_id, 
        business_id, 
        role,
        businesses (
          name
        )
      `
      )
      .eq('user_id', ownerId)
      .single()) as { data: OwnerData | null; error: any };

    if (
      ownerError ||
      !ownerData ||
      ownerData.role !== 'Owner' ||
      !ownerData.business_id
    ) {
      throw new CustomError(
        'Access denied. Only business owners can send invitations.',
        403
      );
    }

    // Check if the email is already registered as staff for this business
    const { data: existingStaff, error: staffError } = await supabase
      .from('all_users')
      .select('user_id')
      .eq('email', email)
      .eq('business_id', ownerData.business_id)
      .single();

    if (existingStaff) {
      throw new CustomError('This email is already registered as staff.', 400);
    }

    // Use Supabase admin client to send invitation
    const { data: invitation, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          business_id: ownerData.business_id,
          business_name: ownerData.businesses.name,
          role: 'Staff',
        },
        redirectTo: `${process.env.FRONTEND_URL}/accept-invitation`,
      });

    if (inviteError) {
      throw new CustomError('Error sending invitation', 500);
    }

    // Generate a UUID token for the invitation
    const token = crypto.randomUUID();

    // Store invitation record
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hour expiration

    const { error: createError } = await supabase.from('invitations').insert({
      business_id: ownerData.business_id,
      email,
      token,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    });

    if (createError) {
      console.error('Error creating invitation record:', createError);
      throw new CustomError('Error recording invitation', 500);
    }

    return sendSuccessResponse(
      c,
      { email },
      'Invitation sent successfully',
      201
    );
  } catch (error) {
    console.error('Error in createInvitation:', error);
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
