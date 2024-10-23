import { Context } from 'hono';
import { supabase } from '../config/supabase';
export const createBusiness = async (c: Context) => {
  try {
    const user = c.get('user');

    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = user.sub;

    // Check if the user is an owner
    const { data: ownerData, error: ownerError } = await supabase
      .from('all_users')
      .select('user_id, role, business_id')
      .eq('user_id', ownerId)
      .single();

    if (ownerError || ownerData.role !== 'Owner') {
      return c.json(
        { error: 'Access denied. Only owners can create businesses.' },
        403
      );
    }

    if (ownerData.business_id) {
      return c.json({ error: 'You have already created a business.' }, 400);
    }

    const formData = await c.req.formData();
    const image = formData.get('image') as File | null;
    const backgroundImage = formData.get('backgroundImage') as File | null;
    const infoImages = formData.getAll('infoImages') as File[];
    const businessDataString = formData.get('businessData') as string;

    if (!businessDataString) {
      return c.json({ error: 'Business data is missing' }, 400);
    }

    const businessData = JSON.parse(businessDataString);

    console.log('businessData:', businessData); // For debugging

    // Validate required fields
    if (!businessData.name || businessData.name.trim() === '') {
      return c.json({ error: 'Name is required.' }, 400);
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

    const { data: business, error: insertError } = await supabase
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
      console.error('Error creating business:', insertError);
      return c.json(
        { error: 'Error creating business', details: insertError },
        500
      );
    }

    // Update the owner's business_id in the all_users table
    const { error: updateError } = await supabase
      .from('all_users')
      .update({ business_id: business.id })
      .eq('user_id', ownerId);

    if (updateError) {
      console.error('Error updating owner business_id:', updateError);
      return c.json({ error: 'Error updating owner information' }, 500);
    }

    return c.json({
      message: 'Business created successfully',
      business,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json(
      { error: 'An unexpected error occurred', details: error },
      500
    );
  }
};

export const updateBusiness = async (c: Context) => {
  try {
    const user = c.get('user');

    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = user.sub;

    // Check if the user is an owner and get their business
    const { data: ownerData, error: ownerError } = await supabase
      .from('all_users')
      .select('user_id, role, business_id')
      .eq('user_id', ownerId)
      .single();

    if (ownerError || ownerData.role !== 'Owner' || !ownerData.business_id) {
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
      const { data: updatedBusiness, error: updateError } = await supabase
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
    const user = c.get('user');

    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = user.sub;

    // Check if the user is an owner and get their business
    const { data: ownerData, error: ownerError } = await supabase
      .from('all_users')
      .select('user_id, role, business_id')
      .eq('user_id', ownerId)
      .single();

    if (ownerError || ownerData.role !== 'Owner' || !ownerData.business_id) {
      return c.json(
        { error: 'Access denied. Only owners with a business can delete it.' },
        403
      );
    }

    try {
      // Update all users associated with this business
      const { error: updateUsersError } = await supabase
        .from('all_users')
        .update({ business_id: null })
        .eq('business_id', ownerData.business_id);

      if (updateUsersError) {
        throw updateUsersError;
      }

      // Delete the business
      const { error: deleteBusinessError } = await supabase
        .from('businesses')
        .delete()
        .eq('id', ownerData.business_id);

      if (deleteBusinessError) {
        throw deleteBusinessError;
      }

      // Commit the transaction
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) {
        throw commitError;
      }

      return c.json({
        message: 'Business deleted successfully',
      });
    } catch (transactionError) {
      const { error: rollbackError } = await supabase.rpc(
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
    const user = c.get('user');

    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const ownerId = user.sub;

    // Check if the user is an owner and get their business
    const { data: ownerData, error: ownerError } = await supabase
      .from('all_users')
      .select('user_id, role, business_id')
      .eq('user_id', ownerId)
      .single();

    if (ownerError || ownerData.role !== 'Owner') {
      return c.json(
        { error: 'Access denied. Only owners can view their business data.' },
        403
      );
    }

    if (!ownerData.business_id) {
      return c.json({ error: 'You have not created a business yet.' }, 404);
    }

    // Fetch the business data
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', ownerData.business_id)
      .single();

    if (businessError) {
      console.error('Error fetching business data:', businessError);
      return c.json({ error: 'Error fetching business data' }, 500);
    }

    return c.json({
      message: 'Business data retrieved successfully',
      business,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
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

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, uint8Array, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error(`Error uploading image to ${bucket}:`, uploadError);
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);

  return data.publicUrl;
}

// Add this new function at the end of the file

export const getAllOrSpecificBusiness = async (c: Context) => {
  try {
    const user = c.get('user');

    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const businessId = c.req.param('businessId');

    let query = supabase.from('businesses').select('*');

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
    const user = c.get('user');

    if (!user || !user.sub) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const userId = user.sub;

    const { data, error } = await supabase
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
      .eq('user_id', userId)
      .gt('total_points', 0);

    if (error) {
      console.error('Error fetching user businesses with points:', error);
      return c.json(
        { error: 'Error fetching user businesses with points' },
        500
      );
    }

    const formattedData = data.map((item) => ({
      ...item.businesses,
      points: item.total_points,
    }));

    return c.json({
      message: 'User businesses with points retrieved successfully',
      businesses: formattedData,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
};
