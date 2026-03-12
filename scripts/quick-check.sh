#!/bin/bash

echo "🔍 Quick Database Check"
echo "======================"
echo ""

cd "$(dirname "$0")/.."

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found"
    exit 1
fi

echo "✓ Running database check..."
echo ""

node -e "
import('mongodb').then(({ MongoClient }) => {
  import('dotenv').then((dotenv) => {
    dotenv.config();
    
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.log('❌ MONGODB_URI not found in .env');
      process.exit(1);
    }
    
    const client = new MongoClient(uri);
    
    client.connect().then(() => {
      const db = client.db();
      
      Promise.all([
        db.collection('chunks').countDocuments(),
        db.collection('sections').countDocuments(),
        db.collection('tenants').countDocuments(),
        db.collection('chunks').find({ text: { \$regex: /aasim|shah/i } }).limit(1).toArray(),
        db.collection('sections').find({ title: { \$regex: /introduction/i } }).toArray()
      ]).then(([chunksCount, sectionsCount, tenantsCount, aasimChunks, introSections]) => {
        console.log('📊 Database Statistics:');
        console.log('  - Tenants:', tenantsCount);
        console.log('  - Sections:', sectionsCount);
        console.log('  - Chunks:', chunksCount);
        console.log('');
        
        if (aasimChunks.length > 0) {
          console.log('✓ Found data about Aasim Shah');
          console.log('  - In section:', aasimChunks[0].sectionTitle);
          console.log('  - TenantId:', aasimChunks[0].tenantId);
          console.log('  - Has embedding:', !!aasimChunks[0].embedding);
        } else {
          console.log('⚠️  No data found about Aasim Shah');
          console.log('   You may need to upload introduction.txt');
        }
        console.log('');
        
        if (introSections.length > 0) {
          console.log('✓ Found introduction section(s):');
          introSections.forEach(s => {
            console.log('  -', s.title, '(' + s.chunkCount + ' chunks)');
          });
        } else {
          console.log('⚠️  No introduction section found');
        }
        console.log('');
        
        // Quick test recommendations
        console.log('📝 Next Steps:');
        if (chunksCount === 0) {
          console.log('  1. Upload your data first');
          console.log('  2. Then run: node scripts/test-vector-search.js');
        } else if (aasimChunks.length === 0) {
          console.log('  1. Upload introduction.txt with Aasim Shah data');
          console.log('  2. Then test the chatbot');
        } else {
          console.log('  1. Run: node scripts/test-vector-search.js');
          console.log('  2. Check MongoDB Atlas for vector search index');
          console.log('  3. Test the chatbot with: \"who is Aasim Shah\"');
        }
        console.log('');
        
        client.close();
      }).catch(err => {
        console.error('❌ Error:', err.message);
        client.close();
        process.exit(1);
      });
    }).catch(err => {
      console.error('❌ Connection failed:', err.message);
      process.exit(1);
    });
  });
});
"

echo "Done!"
