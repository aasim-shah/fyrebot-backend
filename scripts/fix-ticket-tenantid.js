import mongodb from '../src/db/mongodb.js';

async function fixTickets() {
  try {
    await mongodb.connect();
    const db = mongodb.getDb();
    
    // Update tickets with the wrong tenantId
    const result = await db.collection('tickets').updateMany(
      { tenantId: '696406353b7d7a3e6d0f1dd7' },
      { $set: { tenantId: 'ten_Wn3RGf1DXtXMvu65oyQDK' } }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} tickets`);
    
    // Verify the update
    const tickets = await db.collection('tickets').find({ tenantId: 'ten_Wn3RGf1DXtXMvu65oyQDK' }).toArray();
    console.log(`✅ Found ${tickets.length} tickets with correct tenantId`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixTickets();
