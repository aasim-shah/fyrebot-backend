import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function checkWorkChunks() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    // Get work experience chunks
    const workChunks = await db.collection('chunks')
      .find({ sectionId: 'sec_nM6vf8EuCUmLSSYfpFWUG' })
      .sort({ position: 1 })
      .toArray();
    
    console.log('\n=== WORK EXPERIENCE CHUNKS ANALYSIS ===\n');
    console.log(`Total chunks: ${workChunks.length}\n`);
    
    workChunks.forEach((chunk, idx) => {
      console.log(`CHUNK ${idx + 1}:`);
      console.log(`Length: ${chunk.text.length} characters`);
      console.log(`Preview: ${chunk.text.substring(0, 150)}...`);
      console.log(`Has embedding: ${chunk.embedding ? 'YES (' + chunk.embedding.length + ' dimensions)' : 'NO'}`);
      console.log('---\n');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

checkWorkChunks();
