import mongodb from '../src/db/mongodb.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkWorkExperience() {
  try {
    await mongodb.connect();
    const db = mongodb.getDb();
    
    console.log('\n=== Checking Work Experience Data ===\n');
    
    // Get all sections
    const sections = await db.collection('sections').find({}).toArray();
    console.log(`Total sections in database: ${sections.length}\n`);
    
    // Find work experience related sections
    const workSections = sections.filter(s => 
      s.title.toLowerCase().includes('work') || 
      s.title.toLowerCase().includes('experience') ||
      s.title.toLowerCase().includes('job') ||
      s.title.toLowerCase().includes('employment')
    );
    
    console.log(`Work experience related sections: ${workSections.length}`);
    workSections.forEach(section => {
      console.log(`  - ${section.title} (Type: ${section.type}, Chunks: ${section.chunkCount})`);
    });
    
    // Check chunks for work experience
    console.log('\n=== Checking Chunks ===\n');
    const chunks = await db.collection('chunks').find({}).toArray();
    console.log(`Total chunks in database: ${chunks.length}`);
    
    const workChunks = chunks.filter(c => 
      c.sectionTitle.toLowerCase().includes('work') || 
      c.sectionTitle.toLowerCase().includes('experience') ||
      c.sectionTitle.toLowerCase().includes('job') ||
      c.text.toLowerCase().includes('work experience')
    );
    
    console.log(`Work experience related chunks: ${workChunks.length}\n`);
    
    if (workChunks.length > 0) {
      console.log('Sample work experience chunks:');
      workChunks.slice(0, 3).forEach((chunk, idx) => {
        console.log(`\n  Chunk ${idx + 1}:`);
        console.log(`  Title: ${chunk.sectionTitle}`);
        console.log(`  Has embedding: ${chunk.embedding ? 'YES' : 'NO'}`);
        console.log(`  Text preview: ${chunk.text.substring(0, 100)}...`);
      });
    }
    
    // List all section titles for reference
    console.log('\n=== All Section Titles ===\n');
    sections.forEach(s => {
      console.log(`  - ${s.title}`);
    });
    
    await mongodb.disconnect();
    console.log('\n=== Check Complete ===\n');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkWorkExperience();
