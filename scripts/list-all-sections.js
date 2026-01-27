import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function listSections() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB\n');
    
    const db = client.db();
    
    // Get all sections
    const sections = await db.collection('sections').find({}).toArray();
    console.log(`=== TOTAL SECTIONS: ${sections.length} ===\n`);
    
    sections.forEach((section, idx) => {
      console.log(`${idx + 1}. ${section.title}`);
      console.log(`   Type: ${section.type}`);
      console.log(`   Chunks: ${section.chunkCount}`);
      console.log(`   Section ID: ${section.sectionId}`);
      console.log(`   Created: ${section.createdAt}`);
      console.log('');
    });
    
    // Search for work experience specifically
    console.log('\n=== SEARCHING FOR WORK EXPERIENCE ===\n');
    const workSections = sections.filter(s => 
      s.title.toLowerCase().includes('work') || 
      s.title.toLowerCase().includes('experience') ||
      s.title.toLowerCase().includes('11_')
    );
    
    if (workSections.length > 0) {
      console.log(`Found ${workSections.length} work experience section(s):`);
      workSections.forEach(s => {
        console.log(`\n  Title: ${s.title}`);
        console.log(`  Section ID: ${s.sectionId}`);
        console.log(`  Chunks: ${s.chunkCount}`);
      });
    } else {
      console.log('⚠️  NO work experience section found!');
      console.log('The file "11_work_experience_background.txt" may not have been uploaded.');
    }
    
    // Check chunks
    console.log('\n=== CHECKING CHUNKS ===\n');
    const chunks = await db.collection('chunks').find({}).limit(10).toArray();
    console.log(`Total chunks in database: ${await db.collection('chunks').countDocuments({})}`);
    
    if (chunks.length > 0) {
      console.log('\nSample chunk titles:');
      chunks.forEach((chunk, idx) => {
        console.log(`  ${idx + 1}. ${chunk.sectionTitle} (score check: ${chunk.embedding ? 'has embedding' : 'NO EMBEDDING'})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

listSections();
