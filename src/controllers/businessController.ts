import { Context } from 'hono';
import { supabaseAdmin } from '../config/supabaseAdmin';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';

export const createBusiness = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    const ownerId = authUser.id;

    // Check if the user is an owner
    const { data: userData, error: fetchUserError } =
      await supabaseAdmin.auth.admin.getUserById(ownerId);

    if (fetchUserError || !userData || !userData.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const ownerUser = userData.user;

    const ownerData = {
      user_id: ownerUser.id,
      role: ownerUser.user_metadata?.role,
      business_id: ownerUser.user_metadata?.business_id,
    };

    if (ownerData.role !== 'Owner') {
      throw new CustomError(
        'Access denied. Only owners can create businesses.',
        403
      );
    }

    if (ownerData.business_id) {
      throw new CustomError('You have already created a business.', 400);
    }

    const formData = await c.req.formData();
    const image = formData.get('image') as File | null;
    const backgroundImage = formData.get('backgroundImage') as File | null;
    const infoImages = formData.getAll('infoImages') as File[];
    const businessDataString = formData.get('businessData') as string;

    if (!businessDataString) {
      throw new CustomError('Business data is missing', 400);
    }

    const businessData = JSON.parse(businessDataString);

    if (!businessData.name || businessData.name.trim() === '') {
      throw new CustomError('Name is required.', 400);
    }

    let imageUrl = null;
    let backgroundImageUrl = null;
    let infoImageUrls: string[] = [];

    // Upload main image
    if (image) {
      imageUrl = await uploadImage(image, ownerId, 'business-images');
    }

    // Upload background image
    if (backgroundImage) {
      backgroundImageUrl = await uploadImage(
        backgroundImage,
        ownerId,
        'business-background-images'
      );
    }

    // Upload info images
    for (const infoImage of infoImages) {
      const infoImageUrl = await uploadImage(
        infoImage,
        ownerId,
        'business-info-images'
      );
      if (infoImageUrl) {
        infoImageUrls.push(infoImageUrl);
      }
    }

    const { data: business, error: insertError } = await supabaseAdmin
      .from('businesses')
      .insert({
        name: businessData.name,
        loyalty_type: businessData.loyaltyType,
        opening_time: businessData.openingTime,
        phone_number: businessData.phoneNumber,
        location: businessData.location,
        description: businessData.description,
        company_name: businessData.companyName,
        registration_place: businessData.registrationPlace,
        registry_number: businessData.registryNumber,
        website: businessData.website,
        image_url: imageUrl,
        background_image_url: backgroundImageUrl,
        info_image_urls: infoImageUrls,
      })
      .select()
      .single();

    if (insertError) {
      throw new CustomError('Error creating business', 500);
    }

    // Update the owner's user metadata with the new business ID
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(ownerId, {
        user_metadata: {
          ...ownerUser.user_metadata,
          business_id: business.id,
        },
      });

    if (updateError) {
      throw new CustomError('Error updating owner information', 500);
    }

    return sendSuccessResponse(
      c,
      { business },
      'Business created successfully',
      201
    );
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const updateBusiness = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = authUser.id;

    // Check if the user is an owner and get their business
    const { data: userData, error: fetchUserError } =
      await supabaseAdmin.auth.admin.getUserById(ownerId);

    if (fetchUserError || !userData || !userData.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const ownerUser = userData.user;

    const ownerData = {
      user_id: ownerUser.id,
      role: ownerUser.user_metadata?.role,
      business_id: ownerUser.user_metadata?.business_id,
    };

    if (ownerData.role !== 'Owner' || !ownerData.business_id) {
      return c.json(
        { error: 'Access denied. Only owners with a business can update it.' },
        403
      );
    }

    const formData = await c.req.formData();
    const image = formData.get('image') as File | null;
    const backgroundImage = formData.get('backgroundImage') as File | null;
    const infoImages = formData.getAll('infoImages') as File[];
    const businessDataString = formData.get('businessData') as string;

    const businessData = JSON.parse(businessDataString);

    const updateData: any = {};

    // Only include fields that are provided and not empty
    if (businessData.name !== undefined) updateData.name = businessData.name;
    if (businessData.openingTime !== undefined)
      updateData.opening_time = businessData.openingTime;
    if (businessData.phoneNumber !== undefined)
      updateData.phone_number = businessData.phoneNumber;
    if (businessData.location !== undefined)
      updateData.location = businessData.location;
    if (businessData.description !== undefined)
      updateData.description = businessData.description;
    if (businessData.companyName !== undefined)
      updateData.company_name = businessData.companyName;
    if (businessData.registrationPlace !== undefined)
      updateData.registration_place = businessData.registrationPlace;
    if (businessData.registryNumber !== undefined)
      updateData.registry_number = businessData.registryNumber;
    if (businessData.website !== undefined)
      updateData.website = businessData.website;
    if (businessData.loyaltyType !== undefined)
      updateData.loyalty_type = businessData.loyaltyType;

    // Handle image uploads
    if (image) {
      const imageUrl = await uploadImage(image, ownerId, 'business-images');
      if (imageUrl) updateData.image_url = imageUrl;
    }

    if (backgroundImage) {
      const backgroundImageUrl = await uploadImage(
        backgroundImage,
        ownerId,
        'business-background-images'
      );
      if (backgroundImageUrl)
        updateData.background_image_url = backgroundImageUrl;
    }

    if (infoImages.length > 0) {
      const infoImageUrls = [];
      for (const infoImage of infoImages) {
        const infoImageUrl = await uploadImage(
          infoImage,
          ownerId,
          'business-info-images'
        );
        if (infoImageUrl) infoImageUrls.push(infoImageUrl);
      }
      if (infoImageUrls.length > 0) updateData.info_image_urls = infoImageUrls;
    }

    // Only proceed with the update if there are fields to update
    if (Object.keys(updateData).length > 0) {
      const { data: updatedBusiness, error: updateError } = await supabaseAdmin
        .from('businesses')
        .update(updateData)
        .eq('id', ownerData.business_id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating business:', updateError);
        return c.json({ error: 'Error updating business' }, 500);
      }

      return c.json({
        message: 'Business updated successfully',
        business: updatedBusiness,
      });
    } else {
      return c.json({
        message: 'No fields to update',
        business: null,
      });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const deleteBusiness = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = authUser.id;

    // Check if the user is an owner and get their business
    const { data, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(ownerId);

    if (userError || !data || !data.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const ownerUser = data.user;

    const ownerData = {
      user_id: ownerUser.id,
      role: ownerUser.user_metadata?.role,
      business_id: ownerUser.user_metadata?.business_id,
    };

    if (ownerData.role !== 'Owner' || !ownerData.business_id) {
      return c.json(
        { error: 'Access denied. Only owners with a business can delete it.' },
        403
      );
    }

    try {
      // Start a Supabase transaction
      const { error: beginError } =
        await supabaseAdmin.rpc('begin_transaction');
      if (beginError) throw beginError;

      // Update all users associated with this business
      const { data: usersToUpdate, error: fetchUsersError } =
        await supabaseAdmin.auth.admin.listUsers();
      if (fetchUsersError) throw fetchUsersError;

      for (const user of usersToUpdate.users) {
        if (user.user_metadata?.business_id === ownerData.business_id) {
          const { error: updateUserError } =
            await supabaseAdmin.auth.admin.updateUserById(user.id, {
              user_metadata: {
                ...user.user_metadata,
                business_id: null,
                role: user.id === ownerId ? 'Owner' : null, // Keep the owner role for the owner
              },
            });
          if (updateUserError) throw updateUserError;
        }
      }

      // Delete the business
      const { error: deleteBusinessError } = await supabaseAdmin
        .from('businesses')
        .delete()
        .eq('id', ownerData.business_id);

      if (deleteBusinessError) {
        throw deleteBusinessError;
      }

      // Commit the transaction
      const { error: commitError } =
        await supabaseAdmin.rpc('commit_transaction');
      if (commitError) {
        throw commitError;
      }

      return c.json({
        message: 'Business deleted successfully',
      });
    } catch (transactionError) {
      const { error: rollbackError } = await supabaseAdmin.rpc(
        'rollback_transaction'
      );
      if (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      console.error('Error in delete business transaction:', transactionError);
      return c.json({ error: 'Error deleting business' }, 500);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const getBusiness = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      return sendErrorResponse(c, 'Not authenticated', 401);
    }

    const userId = authUser.id;

    // Check if the user is an owner or staff and get their business
    const { data, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !data || !data.user) {
      throw new CustomError('Error fetching user data', 500);
    }

    const user = data.user;

    const userData = {
      user_id: user.id,
      role: user.user_metadata?.role,
      business_id: user.user_metadata?.business_id,
    };

    if (!['Owner', 'Staff'].includes(userData.role)) {
      return sendErrorResponse(
        c,
        'Access denied. Only owners and staff can view business data.',
        403
      );
    }

    if (!userData.business_id) {
      return sendErrorResponse(
        c,
        'No business associated with this user.',
        404
      );
    }

    // Fetch the business data
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', userData.business_id)
      .single();

    if (businessError) {
      console.error('Error fetching business data:', businessError);
      return sendErrorResponse(c, 'Error fetching business data', 500);
    }

    return sendSuccessResponse(
      c,
      { business },
      'Business data retrieved successfully'
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

// Helper function to upload images
async function uploadImage(
  file: File,
  ownerId: string,
  bucket: string
): Promise<string | null> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${ownerId}-${Date.now()}.${fileExt}`;

  // Convert File to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(fileName, uint8Array, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error(`Error uploading image to ${bucket}:`, uploadError);
    return null;
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(fileName);

  return data.publicUrl;
}

// Add this new function at the end of the file

export const getAllOrSpecificBusiness = async (c: Context) => {
  try {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const businessId = c.req.param('businessId');

    let query = supabaseAdmin.from('businesses').select('*');

    if (businessId) {
      query = query.eq('id', businessId);
    }

    const { data: businesses, error } = await query;

    if (error) {
      console.error('Error fetching businesses:', error);
      return c.json({ error: 'Error fetching businesses' }, 500);
    }

    if (businessId && businesses.length === 0) {
      return c.json({ error: 'Business not found' }, 404);
    }

    return c.json({
      message: businessId
        ? 'Business retrieved successfully'
        : 'Businesses retrieved successfully',
      businesses: businessId ? businesses[0] : businesses,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};

export const getUserBusinessesWithPoints = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      return sendErrorResponse(c, 'Not authenticated', 401);
    }

    // Verify the user exists first
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(authUser.id);

    if (userError || !userData) {
      console.error('Error fetching user:', userError);
      return sendErrorResponse(c, 'User not found', 404);
    }

    const { data, error } = await supabaseAdmin
      .from('user_loyalty_points')
      .select(
        `
        total_points,
        businesses (
          id,
          name,
          description,
          image_url
        )
      `
      )
      .eq('user_id', authUser.id)
      .gt('total_points', 0);

    if (error) {
      console.error('Error fetching user businesses with points:', error);
      return sendErrorResponse(
        c,
        'Error fetching user businesses with points',
        500
      );
    }

    const formattedData = data.map((item) => ({
      ...item.businesses,
      points: item.total_points,
    }));

    return sendSuccessResponse(
      c,
      { businesses: formattedData },
      'User businesses with points retrieved successfully'
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const getPublicBusinessData = async (c: Context) => {
  try {
    const businessId = c.req.param('businessId');

    let query = supabaseAdmin.from('businesses').select(`
        id,
        name,
        created_at,
        loyalty_type,
        opening_time,
        phone_number,
        location,
        description,
        company_name,
        registration_place,
        registry_number,
        website,
        image_url,
        background_image_url,
        info_image_urls
      `);

    if (businessId) {
      query = query.eq('id', businessId);
    } else {
      query = query.limit(10);
    }

    const { data: businesses, error } = await query;

    if (error) {
      console.error('Error fetching public business data:', error);
      return c.json({ error: 'Error fetching public business data' }, 500);
    }

    if (businessId && businesses.length === 0) {
      return c.json({ error: 'Business not found' }, 404);
    }

    return c.json({
      message: 'Business retrieved successfully',
      businesses: businessId ? businesses[0] : businesses,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};
