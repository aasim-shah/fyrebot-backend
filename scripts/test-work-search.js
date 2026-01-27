import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function testWorkSearch() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('\n=== WORK EXPERIENCE CHUNKS ===\n');
    
    const workChunks = await db.collection('chunks')
      .find({ sectionId: 'sec_nM6vf8EuCUmLSSYfpFWUG' })
      .sort({ position: 1 })
      .toArray();
    
    console.log(`Found ${workChunks.length} chunks\n`);
    
    workChunks.forEach((chunk, idx) => {
      console.log(`--- Chunk ${idx + 1} (${chunk.text.length} chars) ---`);
      console.log(chunk.text.substring(0, 300));
      console.log('...\n');
    });
    
    // Now simulate a search
    console.log('\n=== SIMULATING SEARCH: "work experience" ===\n');
    
    const allChunks = await db.collection('chunks').find({}).toArray();
    console.log(`Total chunks to search: ${allChunks.length}`);
    
    // Check which chunks contain work experience keywords
    const matches = allChunks.filter(c => {
      const text = c.text.toLowerCase();
      return text.includes('work experience') || 
             text.includes('job history') || 
             text.includes('employment') ||
             (text.includes('years') && text.includes('experience'));
    });
    
    console.log(`\nChunks mentioning work/experience: ${matches.length}`);
    matches.forEach(m => {
      console.log(`  - ${m.sectionTitle} (${m.sectionId === 'sec_nM6vf8EuCUmLSSYfpFWUG' ? '✓ TARGET FILE' : 'other file'})`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

testWorkSearch();
