const bcrypt = require('bcryptjs');
const dbModule = require('./db');
// Use the wrapped prepare/exec/transaction API
const db = dbModule;

console.log('🍔 Seeding LaBurgertory database...');

// Categories
const categories = [
  { name: 'Burgers', sort_order: 1 },
  { name: 'Hungarian Sausage', sort_order: 2 },
  { name: 'Fries', sort_order: 3 },
  { name: 'Nachos', sort_order: 4 },
  { name: 'Tacos', sort_order: 5 },
  { name: 'Quesadilla', sort_order: 6 },
  { name: 'Burrito', sort_order: 7 },
  { name: 'Chicken Wings', sort_order: 8 },
  { name: 'Drinks', sort_order: 9 },
  { name: 'Others', sort_order: 10 },
];

const insertCategory = db.prepare(
  'INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)'
);
for (const c of categories) insertCategory.run(c.name, c.sort_order);

const getCat = (name) => db.prepare('SELECT id FROM categories WHERE name = ?').get(name);

// Products — prices left at 0 if unknown (editable in app)
const products = [
  // Burgers
  { cat: 'Burgers', name: 'Classic LB Burger', description: 'Smash patty, American cheese, LB special sauce, pickles, onions', price: 189 },
  { cat: 'Burgers', name: 'Double Smash', description: 'Two smash patties, double cheese, caramelized onions, special sauce', price: 249 },
  { cat: 'Burgers', name: 'Mushroom Swiss', description: 'Smash patty, sautéed mushrooms, Swiss cheese, garlic aioli', price: 219 },
  { cat: 'Burgers', name: 'BBQ Bacon Burger', description: 'Smash patty, crispy bacon, cheddar, BBQ sauce, crispy onion rings', price: 259 },
  { cat: 'Burgers', name: 'Spicy Bird', description: 'Crispy fried chicken, spicy mayo, coleslaw, pickles', price: 199 },
  { cat: 'Burgers', name: 'Crispy Chicken', description: 'Classic crispy chicken fillet, lettuce, tomato, mayo', price: 189 },
  { cat: 'Burgers', name: 'LB Cheesy Smash', description: 'Triple cheese smash — cheddar, American, mozzarella', price: 269 },
  // Hungarian Sausage
  { cat: 'Hungarian Sausage', name: 'Original Hungarian', description: 'Grilled Hungarian sausage, mustard, pickled cucumber', price: 159 },
  { cat: 'Hungarian Sausage', name: 'Cheesy Hungarian', description: 'Hungarian sausage smothered in melted cheese sauce', price: 179 },
  { cat: 'Hungarian Sausage', name: 'Garlic Hungarian', description: 'Sausage with roasted garlic butter and herbs', price: 169 },
  // Fries
  { cat: 'Fries', name: 'Classic Fries', description: 'Golden crispy fries, sea salt', price: 79 },
  { cat: 'Fries', name: 'Loaded Fries', description: 'Fries topped with cheese sauce, bacon bits, jalapeños', price: 139 },
  { cat: 'Fries', name: 'Garlic Parmesan Fries', description: 'Fries tossed in garlic butter, topped with parmesan', price: 119 },
  { cat: 'Fries', name: 'Truffle Fries', description: 'Crispy fries with truffle oil and parmesan', price: 149 },
  // Nachos
  { cat: 'Nachos', name: 'Classic Nachos', description: 'Tortilla chips, cheese sauce, jalapeños, sour cream, salsa', price: 159 },
  { cat: 'Nachos', name: 'Loaded Nachos', description: 'Nachos with seasoned beef, cheese sauce, guacamole, full toppings', price: 219 },
  // Tacos
  { cat: 'Tacos', name: 'Beef Taco (2pcs)', description: 'Seasoned ground beef, lettuce, cheese, pico de gallo, crema', price: 129 },
  { cat: 'Tacos', name: 'Chicken Taco (2pcs)', description: 'Grilled chicken, avocado, shredded cabbage, chipotle mayo', price: 139 },
  // Quesadilla
  { cat: 'Quesadilla', name: 'Cheese Quesadilla', description: 'Flour tortilla, melted three-cheese blend, served with salsa', price: 119 },
  { cat: 'Quesadilla', name: 'Chicken Quesadilla', description: 'Grilled chicken, mixed peppers, cheese, chipotle crema', price: 169 },
  // Burrito
  { cat: 'Burrito', name: 'Classic Beef Burrito', description: 'Seasoned beef, rice, beans, cheese, salsa, sour cream, wrapped tight', price: 189 },
  { cat: 'Burrito', name: 'Chicken Burrito', description: 'Grilled chicken, cilantro rice, black beans, guacamole, cheese', price: 189 },
  // Chicken Wings
  { cat: 'Chicken Wings', name: 'Wings 6pc', description: 'Choose: Buffalo / Honey Garlic / BBQ / Plain. Served with ranch', price: 179 },
  { cat: 'Chicken Wings', name: 'Wings 12pc', description: 'Choose: Buffalo / Honey Garlic / BBQ / Plain. Served with ranch', price: 329 },
  // Drinks
  { cat: 'Drinks', name: 'Coke (Regular)', description: '350ml can', price: 55 },
  { cat: 'Drinks', name: 'Bottled Water', description: '500ml', price: 35 },
  { cat: 'Drinks', name: 'Iced Tea', description: 'House-made lemon iced tea, 16oz', price: 65 },
  { cat: 'Drinks', name: 'Lemonade', description: 'Fresh-squeezed lemonade, 16oz', price: 75 },
  // Others
  { cat: 'Others', name: 'Extra Sauce', description: 'Special sauce, BBQ, ranch, chipotle', price: 25 },
  { cat: 'Others', name: 'Add Cheese Slice', description: 'American or cheddar cheese', price: 30 },
  { cat: 'Others', name: 'Add Bacon', description: 'Two strips of crispy bacon', price: 45 },
];

const insertProduct = db.prepare(
  'INSERT OR IGNORE INTO products (category_id, name, description, price) VALUES (?, ?, ?, ?)'
);
for (const p of products) {
  const cat = getCat(p.cat);
  if (cat) insertProduct.run(cat.id, p.name, p.description, p.price);
}

// Default owner account
const existingOwner = db.prepare("SELECT id FROM users WHERE email_or_username = 'owner'").get();
if (!existingOwner) {
  const hash = bcrypt.hashSync('laburgertory2024', 10);
  db.prepare(
    "INSERT INTO users (name, email_or_username, password_hash, role) VALUES (?, ?, ?, ?)"
  ).run('Owner', 'owner', hash, 'owner');
  console.log('✅ Default owner created — username: owner / password: laburgertory2024');
}

// Default settings
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('gcash_number', '09XX-XXX-XXXX');
insertSetting.run('gcash_name', 'LaBurgertory');
insertSetting.run('gcash_qr_image_url', '');
insertSetting.run('shop_name', 'LaBurgertory');
insertSetting.run('shop_tagline', 'Smash. Stack. Devour.');

// Sample ingredients for costing
const ingredients = [
  { name: 'Beef Patty (80/20)', unit: 'pc', cost_per_unit: 45, current_stock: 50, reorder_point: 20 },
  { name: 'Burger Bun', unit: 'pc', cost_per_unit: 18, current_stock: 60, reorder_point: 25 },
  { name: 'American Cheese Slice', unit: 'pc', cost_per_unit: 12, current_stock: 80, reorder_point: 30 },
  { name: 'Lettuce', unit: 'g', cost_per_unit: 0.08, current_stock: 500, reorder_point: 200 },
  { name: 'Tomato', unit: 'g', cost_per_unit: 0.05, current_stock: 400, reorder_point: 150 },
  { name: 'Onion', unit: 'g', cost_per_unit: 0.04, current_stock: 500, reorder_point: 200 },
  { name: 'LB Special Sauce', unit: 'ml', cost_per_unit: 0.1, current_stock: 1000, reorder_point: 300 },
  { name: 'Pickles', unit: 'pc', cost_per_unit: 2, current_stock: 100, reorder_point: 40 },
  { name: 'Bacon Strip', unit: 'pc', cost_per_unit: 20, current_stock: 40, reorder_point: 15 },
  { name: 'Hungarian Sausage', unit: 'pc', cost_per_unit: 65, current_stock: 30, reorder_point: 10 },
  { name: 'Chicken Fillet', unit: 'pc', cost_per_unit: 55, current_stock: 25, reorder_point: 10 },
  { name: 'French Fries (frozen)', unit: 'g', cost_per_unit: 0.15, current_stock: 5000, reorder_point: 1500 },
  { name: 'Cheese Sauce', unit: 'ml', cost_per_unit: 0.12, current_stock: 2000, reorder_point: 500 },
  { name: 'Tortilla (small)', unit: 'pc', cost_per_unit: 10, current_stock: 60, reorder_point: 20 },
  { name: 'Tortilla (large)', unit: 'pc', cost_per_unit: 18, current_stock: 40, reorder_point: 15 },
  { name: 'Coke Can 350ml', unit: 'pc', cost_per_unit: 32, current_stock: 48, reorder_point: 24 },
  { name: 'Water Bottle 500ml', unit: 'pc', cost_per_unit: 12, current_stock: 60, reorder_point: 24 },
];

const insertIngredient = db.prepare(
  'INSERT OR IGNORE INTO ingredients (name, unit, cost_per_unit, current_stock, reorder_point) VALUES (?, ?, ?, ?, ?)'
);
for (const ing of ingredients) {
  insertIngredient.run(ing.name, ing.unit, ing.cost_per_unit, ing.current_stock, ing.reorder_point);
}

console.log('✅ Seed complete — categories, products, ingredients, owner account, settings ready.');
