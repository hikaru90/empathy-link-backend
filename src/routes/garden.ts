import { Hono } from 'hono';
import type { Context } from 'hono';

const garden = new Hono();

// GET /api/garden - Get user's garden
garden.get('/', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// TODO: Get user's garden from database
		// const gardenResult = await db.select().from(gardensTable)
		//   .where(eq(gardensTable.user, user.id))
		//   .limit(1);
		//
		// const userSeedsResult = await db.select().from(userSeedsTable)
		//   .where(eq(userSeedsTable.user, user.id))
		//   .limit(1);

		return c.json({
			garden: null, // TODO: Use gardenResult[0]
			userSeeds: null // TODO: Use userSeedsResult[0]
		});
	} catch (error) {
		console.error('Error getting garden:', error);
		return c.json({ error: 'Garden not found' }, 404);
	}
});

// POST /api/garden/plant - Plant an item
garden.post('/plant', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { plotX, plotY, plantId } = await c.req.json();

		// Validate input
		if (plotX < 0 || plotX > 8 || plotY < 0 || plotY > 8) {
			return c.json({ error: 'Invalid plot coordinates' }, 400);
		}

		// TODO: Get user's garden from database
		// const gardenResult = await db.select().from(gardensTable)
		//   .where(eq(gardensTable.user, user.id))
		//   .limit(1);
		// const garden = gardenResult[0];

		// TODO: Get plant info
		// const plant = await db.select().from(itemsTable)
		//   .where(eq(itemsTable.id, plantId))
		//   .limit(1);

		// TODO: Check if user has this item in their inventory
		// const userItem = await db.select().from(userItemsTable)
		//   .where(and(
		//     eq(userItemsTable.user, user.id),
		//     eq(userItemsTable.item, plantId)
		//   ))
		//   .limit(1);
		//
		// if (!userItem || userItem.length === 0 || userItem[0].quantity < 1) {
		//   return c.json({ error: 'Item not in inventory' }, 400);
		// }

		const plotIndex = plotY * 9 + plotX;
		// const currentPlot = garden.grid_data.plots[plotIndex];

		// Handle terraform items differently
		// if (plant[0].category === 'terraform') {
		//   // Terraform logic
		//   const newQuantity = userItem[0].quantity - 1;
		//   if (newQuantity > 0) {
		//     await db.update(userItemsTable)
		//       .set({ quantity: newQuantity })
		//       .where(eq(userItemsTable.id, userItem[0].id));
		//   } else {
		//     await db.delete(userItemsTable)
		//       .where(eq(userItemsTable.id, userItem[0].id));
		//   }
		//
		//   // Update plot terrain
		//   const gridData = { ...garden.grid_data };
		//   const newBuildLevel = plant[0].terraform_type === 'dirt'
		//     ? (currentPlot.build_level || 0) + 1
		//     : currentPlot.build_level || 0;
		//
		//   gridData.plots[plotIndex] = {
		//     ...gridData.plots[plotIndex],
		//     type: plant[0].terraform_type,
		//     build_level: newBuildLevel,
		//     plant_id: plant[0].terraform_type === 'water' ? null : currentPlot.plant_id,
		//     planted_at: plant[0].terraform_type === 'water' ? null : currentPlot.planted_at,
		//     growth_stage: plant[0].terraform_type === 'water' ? 0 : currentPlot.growth_stage
		//   };
		//
		//   await db.update(gardensTable)
		//     .set({ grid_data: gridData })
		//     .where(eq(gardensTable.id, garden.id));
		//
		//   return c.json({
		//     success: true,
		//     plot: gridData.plots[plotIndex],
		//     remainingQuantity: newQuantity > 0 ? newQuantity : 0,
		//     terraform: true
		//   });
		// }

		// Regular planting logic
		// if (currentPlot.plant_id) {
		//   return c.json({ error: 'Plot already occupied' }, 400);
		// }
		//
		// if (currentPlot.type === 'water') {
		//   return c.json({ error: 'Cannot plant on water' }, 400);
		// }

		// TODO: Deduct item from inventory and update grid
		// const newQuantity = userItem[0].quantity - 1;
		// if (newQuantity > 0) {
		//   await db.update(userItemsTable)
		//     .set({ quantity: newQuantity })
		//     .where(eq(userItemsTable.id, userItem[0].id));
		// } else {
		//   await db.delete(userItemsTable)
		//     .where(eq(userItemsTable.id, userItem[0].id));
		// }
		//
		// const gridData = { ...garden.grid_data };
		// gridData.plots[plotIndex] = {
		//   ...gridData.plots[plotIndex],
		//   plant_id: plantId,
		//   planted_at: new Date().toISOString(),
		//   growth_stage: 0
		// };
		//
		// await db.update(gardensTable)
		//   .set({
		//     grid_data: gridData,
		//     total_plants: garden.total_plants + 1
		//   })
		//   .where(eq(gardensTable.id, garden.id));

		return c.json({
			success: true,
			plot: null, // TODO: Use gridData.plots[plotIndex]
			remainingQuantity: 0, // TODO: Use newQuantity
			terraform: false
		});
	} catch (error) {
		console.error('Error planting:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
});

// POST /api/garden/unplant - Remove a plant
garden.post('/unplant', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { plotX, plotY } = await c.req.json();

		// Validate input
		if (plotX < 0 || plotX > 8 || plotY < 0 || plotY > 8) {
			return c.json({ error: 'Invalid plot coordinates' }, 400);
		}

		// TODO: Get user's garden from database
		// const gardenResult = await db.select().from(gardensTable)
		//   .where(eq(gardensTable.user, user.id))
		//   .limit(1);
		// const garden = gardenResult[0];

		// Check if plot has a plant
		const plotIndex = plotY * 9 + plotX;
		// const plot = garden.grid_data.plots[plotIndex];
		//
		// if (!plot.plant_id) {
		//   return c.json({ error: 'Plot is empty' }, 400);
		// }

		// const plantId = plot.plant_id;

		// TODO: Check if user already has this item in inventory
		// let userItem = await db.select().from(userItemsTable)
		//   .where(and(
		//     eq(userItemsTable.user, user.id),
		//     eq(userItemsTable.item, plantId)
		//   ))
		//   .limit(1);

		// Update grid data - remove plant
		// const gridData = { ...garden.grid_data };
		// gridData.plots[plotIndex] = {
		//   ...gridData.plots[plotIndex],
		//   plant_id: null,
		//   planted_at: null,
		//   growth_stage: 0
		// };
		//
		// await db.update(gardensTable)
		//   .set({
		//     grid_data: gridData,
		//     total_plants: garden.total_plants - 1
		//   })
		//   .where(eq(gardensTable.id, garden.id));

		// Add item back to inventory
		// if (userItem && userItem.length > 0) {
		//   await db.update(userItemsTable)
		//     .set({ quantity: userItem[0].quantity + 1 })
		//     .where(eq(userItemsTable.id, userItem[0].id));
		// } else {
		//   await db.insert(userItemsTable).values({
		//     user: user.id,
		//     item: plantId,
		//     quantity: 1,
		//     acquired_at: new Date().toISOString()
		//   });
		// }

		return c.json({
			success: true,
			plot: null, // TODO: Use gridData.plots[plotIndex]
			returnedItem: null // TODO: Use plantId
		});
	} catch (error) {
		console.error('Error unplanting:', error);
		return c.json({ error: 'Internal server error' }, 500);
	}
});

// GET /api/garden/inventory - Get user's inventory
garden.get('/inventory', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		// TODO: Get user's items with item details (using joins)
		// const userItems = await db.select({
		//   id: userItemsTable.id,
		//   item: userItemsTable.item,
		//   quantity: userItemsTable.quantity,
		//   acquired_at: userItemsTable.acquired_at,
		//   itemData: {
		//     id: itemsTable.id,
		//     name: itemsTable.name,
		//     description: itemsTable.description,
		//     category: itemsTable.category,
		//     sprite: itemsTable.sprite
		//   }
		// })
		// .from(userItemsTable)
		// .leftJoin(itemsTable, eq(userItemsTable.item, itemsTable.id))
		// .where(eq(userItemsTable.user, user.id));

		return c.json({
			inventory: [], // TODO: Use userItems
			count: 0 // TODO: Use userItems.length
		});
	} catch (error) {
		console.error('Error loading inventory:', error);
		return c.json({ error: 'Failed to load inventory' }, 500);
	}
});

// POST /api/garden/purchase - Purchase an item
garden.post('/purchase', async (c: Context) => {
	const user = c.get('user');
	if (!user) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		const { plantId } = await c.req.json();

		if (!plantId) {
			return c.json({ error: 'Plant ID is required' }, 400);
		}

		// TODO: Get the item details
		// const item = await db.select().from(itemsTable)
		//   .where(eq(itemsTable.id, plantId))
		//   .limit(1);
		//
		// if (!item || item.length === 0) {
		//   return c.json({ error: 'Item not found' }, 404);
		// }

		// TODO: Get user's current seed inventory
		// const userSeeds = await db.select().from(userSeedsTable)
		//   .where(eq(userSeedsTable.user, user.id))
		//   .limit(1);
		//
		// if (!userSeeds || userSeeds.length === 0) {
		//   return c.json({ error: 'No seed inventory found' }, 404);
		// }
		//
		// const currentSeeds = userSeeds[0].seed_inventory.basic || 0;
		//
		// if (currentSeeds < item[0].seed_cost) {
		//   return c.json({ error: 'Not enough seeds' }, 400);
		// }

		// Deduct seeds from user's inventory
		// const newSeedCount = currentSeeds - item[0].seed_cost;
		// const updatedInventory = {
		//   ...userSeeds[0].seed_inventory,
		//   basic: newSeedCount
		// };
		//
		// await db.update(userSeedsTable)
		//   .set({ seed_inventory: updatedInventory })
		//   .where(eq(userSeedsTable.id, userSeeds[0].id));

		// Add item to user's inventory
		// await db.insert(userItemsTable).values({
		//   user: user.id,
		//   item: plantId,
		//   quantity: 1,
		//   acquired_at: new Date().toISOString()
		// });

		return c.json({
			success: true,
			message: 'Successfully purchased item', // TODO: Use item[0].name
			remainingSeeds: 0 // TODO: Use newSeedCount
		});
	} catch (error) {
		console.error('Error processing purchase:', error);
		return c.json({ error: 'Failed to process purchase' }, 500);
	}
});

export default garden;
