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

    const businessData = JSON.parse(formData.get('businessData') as string);

    const {
      name,
      openingTime,
      phoneNumber,
      location,
      description,
      companyName,
      registrationPlace,
      registryNumber,
      website,
      loyaltyType,
    } = businessData;

    // Validate required fields
    if (!name || !companyName || !registryNumber) {
      return c.json(
        { error: 'Name, company name, and registry number are required.' },
        400
      );
    }

    let imageUrl = null;

    if (image) {
      const fileExt = image.name.split('.').pop();
      const fileName = `${ownerId}-${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('business-images')
        .upload(fileName, image);

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        // Instead of returning immediately, we'll continue without the image
        console.warn('Continuing business creation without image');
      } else {
        const {
          data: { publicUrl },
        } = supabase.storage.from('business-images').getPublicUrl(fileName);

        imageUrl = publicUrl;
      }
    }

    const { data: business, error: insertError } = await supabase
      .from('businesses')
      .insert({
        name,
        opening_time: openingTime,
        phone_number: phoneNumber,
        location,
        description,
        company_name: companyName,
        registration_place: registrationPlace,
        registry_number: registryNumber,
        website,
        loyalty_type: loyaltyType,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating business:', insertError);
      return c.json({ error: 'Error creating business' }, 500);
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
    return c.json({ error: 'An unexpected error occurred' }, 500);
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

    const businessData = JSON.parse(formData.get('businessData') as string);

    const {
      name,
      openingTime,
      phoneNumber,
      location,
      description,
      companyName,
      registrationPlace,
      registryNumber,
      website,
      loyaltyType,
    } = businessData;

    let imageUrl = null;

    if (image) {
      const fileExt = image.name.split('.').pop();
      const fileName = `${ownerId}-${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('business-images')
        .upload(fileName, image);

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        // Continue without updating the image
      } else {
        const {
          data: { publicUrl },
        } = supabase.storage.from('business-images').getPublicUrl(fileName);

        imageUrl = publicUrl;
      }
    }

    const updateData: any = {
      name,
      opening_time: openingTime,
      phone_number: phoneNumber,
      location,
      description,
      company_name: companyName,
      registration_place: registrationPlace,
      registry_number: registryNumber,
      website,
      loyalty_type: loyaltyType,
    };

    if (imageUrl) {
      updateData.image_url = imageUrl;
    }

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

    const businessId = ownerData.business_id;

    // Start a Supabase transaction
    const { data, error } = await supabase.rpc('begin_transaction');
    if (error) {
      console.error('Error starting transaction:', error);
      return c.json({ error: 'Error starting transaction' }, 500);
    }

    try {
      // Update all users associated with this business
      const { error: updateUsersError } = await supabase
        .from('all_users')
        .update({ business_id: null })
        .eq('business_id', businessId);

      if (updateUsersError) {
        throw updateUsersError;
      }

      // Delete the business
      const { error: deleteBusinessError } = await supabase
        .from('businesses')
        .delete()
        .eq('id', businessId);

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
      // Rollback the transaction if any error occurs
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
