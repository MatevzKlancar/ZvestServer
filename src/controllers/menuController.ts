import { Context } from 'hono';
import { supabaseAdmin } from '../config/supabaseAdmin';
import CustomError from '../utils/customError';
import { sendSuccessResponse, sendErrorResponse } from '../utils/apiResponse';

// Base interfaces for translations
interface Translation {
  language_code: string;
  name: string;
  description?: string;
}

interface MenuItemTranslation {
  name: string;
  description?: string;
  language_code: string;
}

interface MenuCategoryTranslation {
  name: string;
  description?: string;
  language_code: string;
}

// Base interfaces for menu items and categories
interface MenuItem {
  price: number;
  duration?: number;
  image_url?: string;
  translations: MenuItemTranslation[];
}

interface MenuCategory {
  translations: MenuCategoryTranslation[];
  items: MenuItem[];
}

// Add these interfaces for update operations
interface UpdateMenuRequest {
  type: 'restaurant' | 'service';
  is_active: boolean;
  categories: UpdateMenuCategory[];
}

interface UpdateMenuItem extends MenuItem {
  id?: string;
  category_id?: string;
  order_index?: number;
}

interface UpdateMenuCategory extends MenuCategory {
  id?: string;
  menu_id?: string;
  order_index?: number;
  items: UpdateMenuItem[];
}

export const createMenu = async (c: Context) => {
  try {
    const authUser = c.get('user');

    if (!authUser || !authUser.id) {
      throw new CustomError('Not authenticated', 401);
    }

    // Get business ID from user metadata
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(authUser.id);

    if (userError || !userData?.user?.user_metadata?.business_id) {
      throw new CustomError('Business not found', 404);
    }

    const businessId = userData.user.user_metadata.business_id;
    const { type, categories } = await c.req.json();

    // Start transaction
    const { error: beginError } = await supabaseAdmin.rpc('begin_transaction');
    if (beginError) throw beginError;

    try {
      // Create menu
      const { data: menu, error: menuError } = await supabaseAdmin
        .from('menus')
        .insert({ business_id: businessId, type })
        .select()
        .single();

      if (menuError) throw menuError;

      // Create categories with translations and items
      for (const [categoryIndex, category] of categories.entries()) {
        // Create category
        const { data: menuCategory, error: categoryError } = await supabaseAdmin
          .from('menu_categories')
          .insert({
            menu_id: menu.id,
            order_index: categoryIndex,
          })
          .select()
          .single();

        if (categoryError) throw categoryError;

        // Create category translations
        const categoryTranslations = category.translations.map(
          (translation: MenuCategoryTranslation) => ({
            category_id: menuCategory.id,
            ...translation,
          })
        );

        const { error: translationError } = await supabaseAdmin
          .from('menu_category_translations')
          .insert(categoryTranslations);

        if (translationError) throw translationError;

        // Create items with translations
        for (const [itemIndex, item] of category.items.entries()) {
          const { data: menuItem, error: itemError } = await supabaseAdmin
            .from('menu_items')
            .insert({
              category_id: menuCategory.id,
              price: item.price,
              duration: item.duration,
              image_url: item.image_url,
              order_index: itemIndex,
            })
            .select()
            .single();

          if (itemError) throw itemError;

          const itemTranslations = item.translations.map(
            (translation: MenuItemTranslation) => ({
              item_id: menuItem.id,
              ...translation,
            })
          );

          const { error: itemTranslationError } = await supabaseAdmin
            .from('menu_item_translations')
            .insert(itemTranslations);

          if (itemTranslationError) throw itemTranslationError;
        }
      }

      // Commit transaction
      const { error: commitError } =
        await supabaseAdmin.rpc('commit_transaction');
      if (commitError) throw commitError;

      return sendSuccessResponse(
        c,
        { menu_id: menu.id },
        'Menu created successfully'
      );
    } catch (error) {
      // Rollback transaction
      const { error: rollbackError } = await supabaseAdmin.rpc(
        'rollback_transaction'
      );
      if (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating menu:', error);
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const getMenu = async (c: Context) => {
  try {
    const authUser = c.get('user');
    if (!authUser?.id) throw new CustomError('Not authenticated', 401);

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(authUser.id);
    if (userError || !userData?.user?.user_metadata?.business_id) {
      throw new CustomError('Business not found', 404);
    }

    const businessId = userData.user.user_metadata.business_id;
    const languageCode = c.req.query('language');

    // Get menu with all related data
    const { data: menus, error: menuError } = await supabaseAdmin
      .from('menus')
      .select(
        `
        id,
        type,
        is_active,
        menu_categories (
          id,
          order_index,
          menu_category_translations (
            name,
            description,
            language_code
          ),
          menu_items (
            id,
            price,
            duration,
            image_url,
            order_index,
            menu_item_translations (
              name,
              description,
              language_code
            )
          )
        )
      `
      )
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (menuError) throw menuError;

    // Transform the data based on language parameter
    const formattedMenus = menus?.map((menu) => ({
      id: menu.id,
      type: menu.type,
      is_active: menu.is_active,
      categories: menu.menu_categories
        .sort((a, b) => a.order_index - b.order_index)
        .map((category) => {
          // If language is specified, find only that translation, otherwise return all
          const translations = languageCode
            ? [
                category.menu_category_translations.find(
                  (t) => t.language_code === languageCode
                ),
              ]
            : category.menu_category_translations;

          return {
            id: category.id,
            ...(languageCode
              ? {
                  name: translations[0]?.name || '',
                  description: translations[0]?.description,
                }
              : { translations }),
            items: category.menu_items
              .sort((a, b) => a.order_index - b.order_index)
              .map((item) => {
                // If language is specified, find only that translation, otherwise return all
                const itemTranslations = languageCode
                  ? [
                      item.menu_item_translations.find(
                        (t) => t.language_code === languageCode
                      ),
                    ]
                  : item.menu_item_translations;

                return {
                  id: item.id,
                  ...(languageCode
                    ? {
                        name: itemTranslations[0]?.name || '',
                        description: itemTranslations[0]?.description,
                      }
                    : { translations: itemTranslations }),
                  price: item.price,
                  duration: item.duration,
                  image_url: item.image_url,
                };
              }),
          };
        }),
    }));

    return sendSuccessResponse(c, { menus: formattedMenus });
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const updateMenu = async (c: Context) => {
  let transactionStarted = false;

  try {
    const authUser = c.get('user');
    if (!authUser?.id) throw new CustomError('Not authenticated', 401);

    const menuId = c.req.param('menuId');
    const { categories, type, is_active }: UpdateMenuRequest =
      await c.req.json();

    // Verify ownership
    const { data: menu, error: menuError } = await supabaseAdmin
      .from('menus')
      .select('business_id')
      .eq('id', menuId)
      .single();

    if (menuError || !menu) {
      throw new CustomError('Menu not found', 404);
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      authUser.id
    );
    if (menu.business_id !== userData?.user?.user_metadata?.business_id) {
      throw new CustomError('Unauthorized', 403);
    }

    // Start transaction
    const { error: beginError } = await supabaseAdmin.rpc('begin_transaction');
    if (beginError) throw new CustomError('Error starting transaction', 500);
    transactionStarted = true;

    // Update menu
    const { error: updateError } = await supabaseAdmin
      .from('menus')
      .update({ type, is_active })
      .eq('id', menuId);

    if (updateError) throw updateError;

    // Get existing categories
    const { data: existingCategories } = await supabaseAdmin
      .from('menu_categories')
      .select('id')
      .eq('menu_id', menuId);

    const existingCategoryIds = new Set(
      existingCategories?.map((cat) => cat.id)
    );
    const updatedCategoryIds = new Set(
      categories.map((cat) => cat.id).filter(Boolean)
    );

    // Delete categories that are not in the update request
    const categoriesToDelete = [...existingCategoryIds].filter(
      (id) => !updatedCategoryIds.has(id)
    );

    if (categoriesToDelete.length > 0) {
      const { error: deleteCategoriesError } = await supabaseAdmin
        .from('menu_categories')
        .delete()
        .in('id', categoriesToDelete);

      if (deleteCategoriesError) throw deleteCategoriesError;
    }

    // Now handle categories
    for (const [index, category] of categories.entries()) {
      if (category.id) {
        // Check if category exists
        const { data: existingCategory } = await supabaseAdmin
          .from('menu_categories')
          .select('id')
          .eq('id', category.id)
          .single();

        if (!existingCategory) {
          // Create new category with provided ID
          const { data: newCategory, error: newCategoryError } =
            await supabaseAdmin
              .from('menu_categories')
              .insert({
                id: category.id,
                menu_id: menuId,
                order_index: index,
              })
              .select()
              .single();

          if (newCategoryError) throw newCategoryError;

          // Insert translations for new category
          const { error: translationsError } = await supabaseAdmin
            .from('menu_category_translations')
            .insert(
              category.translations.map((t) => ({
                category_id: newCategory.id,
                language_code: t.language_code,
                name: t.name,
                description: t.description,
              }))
            );

          if (translationsError) throw translationsError;

          // Handle items for new category
          for (const [itemIndex, item] of category.items.entries()) {
            // Create new item
            const { data: newItem, error: newItemError } = await supabaseAdmin
              .from('menu_items')
              .insert({
                category_id: newCategory.id,
                price: item.price,
                duration: item.duration,
                image_url: item.image_url,
                order_index: itemIndex,
              })
              .select()
              .single();

            if (newItemError) throw newItemError;

            // Create item translations
            const { error: itemTranslationsError } = await supabaseAdmin
              .from('menu_item_translations')
              .insert(
                item.translations.map((t) => ({
                  item_id: newItem.id,
                  language_code: t.language_code,
                  name: t.name,
                  description: t.description,
                }))
              );

            if (itemTranslationsError) throw itemTranslationsError;
          }
        } else {
          // Update existing category
          const { error: categoryError } = await supabaseAdmin
            .from('menu_categories')
            .update({ order_index: index })
            .eq('id', category.id);

          if (categoryError) throw categoryError;

          // Delete existing translations
          const { error: deleteTransError } = await supabaseAdmin
            .from('menu_category_translations')
            .delete()
            .eq('category_id', category.id);

          if (deleteTransError) throw deleteTransError;

          // Insert new translations
          const { error: translationError } = await supabaseAdmin
            .from('menu_category_translations')
            .insert(
              category.translations.map((translation) => ({
                category_id: category.id,
                language_code: translation.language_code,
                name: translation.name,
                description: translation.description,
              }))
            );

          if (translationError) throw translationError;

          // Get existing items
          const { data: existingItems } = await supabaseAdmin
            .from('menu_items')
            .select('id')
            .eq('category_id', category.id);

          const existingItemIds = new Set(
            existingItems?.map((item) => item.id)
          );
          const updatedItemIds = new Set(
            category.items.map((item) => item.id).filter(Boolean)
          );

          // Delete removed items
          const itemsToDelete = [...existingItemIds].filter(
            (id) => !updatedItemIds.has(id)
          );

          if (itemsToDelete.length > 0) {
            const { error: deleteItemsError } = await supabaseAdmin
              .from('menu_items')
              .delete()
              .in('id', itemsToDelete);

            if (deleteItemsError) throw deleteItemsError;
          }

          // Handle each item
          for (const [itemIndex, item] of category.items.entries()) {
            if (item.id) {
              // First check if the item exists
              const { data: existingItem } = await supabaseAdmin
                .from('menu_items')
                .select('id')
                .eq('id', item.id)
                .single();

              if (!existingItem) {
                // If item doesn't exist, create it as a new item
                const { data: newItem, error: newItemError } =
                  await supabaseAdmin
                    .from('menu_items')
                    .insert({
                      category_id: category.id,
                      price: item.price,
                      duration: item.duration,
                      image_url: item.image_url,
                      order_index: itemIndex,
                    })
                    .select()
                    .single();

                if (newItemError) throw newItemError;

                // Create item translations with the new item id
                const { error: itemTranslationsError } = await supabaseAdmin
                  .from('menu_item_translations')
                  .insert(
                    item.translations.map((t) => ({
                      item_id: newItem.id,
                      language_code: t.language_code,
                      name: t.name,
                      description: t.description,
                    }))
                  );

                if (itemTranslationsError) throw itemTranslationsError;
              } else {
                // Update existing item
                const { error: itemError } = await supabaseAdmin
                  .from('menu_items')
                  .update({
                    price: item.price,
                    duration: item.duration,
                    image_url: item.image_url,
                    order_index: itemIndex,
                  })
                  .eq('id', item.id);

                if (itemError) throw itemError;

                // Delete existing item translations
                const { error: deleteItemTransError } = await supabaseAdmin
                  .from('menu_item_translations')
                  .delete()
                  .eq('item_id', item.id);

                if (deleteItemTransError) throw deleteItemTransError;

                // Insert new item translations
                const { error: itemTranslationError } = await supabaseAdmin
                  .from('menu_item_translations')
                  .insert(
                    item.translations.map((t) => ({
                      item_id: item.id,
                      language_code: t.language_code,
                      name: t.name,
                      description: t.description,
                    }))
                  );

                if (itemTranslationError) throw itemTranslationError;
              }
            } else {
              // Create new item
              const { data: newItem, error: newItemError } = await supabaseAdmin
                .from('menu_items')
                .insert({
                  category_id: category.id,
                  price: item.price,
                  duration: item.duration,
                  image_url: item.image_url,
                  order_index: itemIndex,
                })
                .select()
                .single();

              if (newItemError) throw newItemError;

              // Create item translations
              const { error: itemTranslationsError } = await supabaseAdmin
                .from('menu_item_translations')
                .insert(
                  item.translations.map((t) => ({
                    item_id: newItem.id,
                    language_code: t.language_code,
                    name: t.name,
                    description: t.description,
                  }))
                );

              if (itemTranslationsError) throw itemTranslationsError;
            }
          }
        }
      } else {
        // Create new category
        const { data: newCategory, error: newCategoryError } =
          await supabaseAdmin
            .from('menu_categories')
            .insert({
              menu_id: menuId,
              order_index: index,
            })
            .select()
            .single();

        if (newCategoryError) throw newCategoryError;

        // Insert translations for new category
        const { error: translationsError } = await supabaseAdmin
          .from('menu_category_translations')
          .insert(
            category.translations.map((t) => ({
              category_id: newCategory.id,
              language_code: t.language_code,
              name: t.name,
              description: t.description,
            }))
          );

        if (translationsError) throw translationsError;

        // ... rest of the new category handling code
      }
    }

    // Commit transaction
    const { error: commitError } =
      await supabaseAdmin.rpc('commit_transaction');
    if (commitError) throw new CustomError('Error committing transaction', 500);

    return sendSuccessResponse(c, null, 'Menu updated successfully');
  } catch (error) {
    // Only attempt rollback if transaction was started
    if (transactionStarted) {
      const { error: rollbackError } = await supabaseAdmin.rpc(
        'rollback_transaction'
      );
      if (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }

    console.error('Error updating menu:', error);
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};

export const deleteMenu = async (c: Context) => {
  try {
    const authUser = c.get('user');
    if (!authUser?.id) throw new CustomError('Not authenticated', 401);

    const menuId = c.req.param('menuId');

    // Verify ownership
    const { data: menu, error: menuError } = await supabaseAdmin
      .from('menus')
      .select('business_id')
      .eq('id', menuId)
      .single();

    if (menuError || !menu) throw new CustomError('Menu not found', 404);

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      authUser.id
    );
    if (menu.business_id !== userData?.user?.user_metadata?.business_id) {
      throw new CustomError('Unauthorized', 403);
    }

    // Delete menu (cascading will handle related records)
    const { error: deleteError } = await supabaseAdmin
      .from('menus')
      .delete()
      .eq('id', menuId);

    if (deleteError) throw deleteError;

    return sendSuccessResponse(c, null, 'Menu deleted successfully');
  } catch (error) {
    if (error instanceof CustomError) {
      return sendErrorResponse(c, error.message, error.statusCode);
    }
    return sendErrorResponse(c, 'An unexpected error occurred', 500);
  }
};
