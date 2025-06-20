const axios = require('axios');
const fs = require('fs').promises;

const POSTMAN_API_KEY = process.env.POSTMAN_API_KEY;
const COLLECTION_UID = process.env.COLLECTION_UID;
const POSTMAN_API_BASE = 'https://api.getpostman.com';

async function getCollections() {
  try {
    const response = await axios.get(`${POSTMAN_API_BASE}/collections`, {
      headers: {
        'X-API-Key': POSTMAN_API_KEY
      }
    });
    return response.data.collections;
  } catch (error) {
    console.error('Error fetching collections:', error.response?.data || error.message);
    throw error;
  }
}

async function getCollection(uid) {
  try {
    const response = await axios.get(`${POSTMAN_API_BASE}/collections/${uid}`, {
      headers: {
        'X-API-Key': POSTMAN_API_KEY
      }
    });
    return response.data.collection;
  } catch (error) {
    console.error('Error fetching collection:', error.response?.data || error.message);
    throw error;
  }
}

async function updateCollection(uid, updateData) {
  try {
    const response = await axios.put(`${POSTMAN_API_BASE}/collections/${uid}`, {
      collection: updateData
    }, {
      headers: {
        'X-API-Key': POSTMAN_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    return response.data.collection;
  } catch (error) {
    console.error('Error updating collection:', error.response?.data || error.message);
    throw error;
  }
}

async function createCollection(collectionData) {
  try {
    const response = await axios.post(`${POSTMAN_API_BASE}/collections`, {
      collection: collectionData
    }, {
      headers: {
        'X-API-Key': POSTMAN_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    return response.data.collection;
  } catch (error) {
    console.error('Error creating collection:', error.response?.data || error.message);
    throw error;
  }
}

function extractVersion(name) {
  const match = name.match(/(\d+)\.(\d+)\.(\d+)/);
  if (match) {
    return {
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3])
    };
  }
  return null;
}

function getNextVersion(collections) {
  let highestVersion = null;
  
  collections.forEach(collection => {
    const version = extractVersion(collection.name);
    if (version) {
      const versionNumber = version.major * 10000 + version.minor * 100 + version.patch;
      const highestNumber = highestVersion ? 
        highestVersion.major * 10000 + highestVersion.minor * 100 + highestVersion.patch : 0;
      
      if (versionNumber > highestNumber) {
        highestVersion = version;
      }
    }
  });
  
  // If no version found, start with 1.0.0
  if (!highestVersion) {
    return '1.0.0';
  }
  
  // Increment minor version and reset patch to 0
  highestVersion.minor += 1;
  highestVersion.patch = 0;
  
  return `${highestVersion.major}.${highestVersion.minor}.${highestVersion.patch}`;
}

async function main() {
  try {
    console.log('Starting collection versioning process...');
    
    // Get all collections
    const collections = await getCollections();
    console.log('Found collections:', collections.map(c => c.name));
    
    // Find the current "latest" collection by name first, fallback to UID
    let latestCollection = collections.find(c => c.name === 'Pinterest REST API (latest)');
    
    if (!latestCollection) {
      console.log('Collection "Pinterest REST API (latest)" not found by name, trying by UID...');
      latestCollection = collections.find(c => c.uid === COLLECTION_UID);
      if (!latestCollection) {
        throw new Error(`Collection not found by name "Pinterest REST API (latest)" or by UID ${COLLECTION_UID}`);
      }
    }
    
    console.log(`Current collection: ${latestCollection.name} (UID: ${latestCollection.uid})`);
    
    // Calculate next version
    const nextVersion = getNextVersion(collections);
    const versionedName = `Pinterest REST API ${nextVersion}`;
    
    console.log(`Next version: ${versionedName}`);
    
    // Step 1: Rename the existing "latest" collection to versioned name
    console.log(`Renaming "${latestCollection.name}" to "${versionedName}"...`);
    
    // First, get the full collection data
    const fullCollectionData = await getCollection(latestCollection.uid);
    
    // Update the name in the collection data
    fullCollectionData.info.name = versionedName;
    
    // Remove uid and id as they shouldn't be in update payload
    delete fullCollectionData.uid;
    delete fullCollectionData.id;
    
    await updateCollection(latestCollection.uid, fullCollectionData);
    console.log('Successfully renamed existing collection');
    
    // Step 2: Create new "latest" collection from OpenAPI conversion
    // Read the converted collection file from the OpenAPI conversion step
    const convertedCollectionPath = './postman/collection.json';
    
    console.log('Reading converted collection from OpenAPI...');
    const convertedCollectionData = JSON.parse(await fs.readFile(convertedCollectionPath, 'utf8'));
    
    // Ensure the new collection has the correct name
    if (!convertedCollectionData.info) {
      convertedCollectionData.info = {};
    }
    convertedCollectionData.info.name = 'Pinterest REST API (latest)';
    
    // Ensure it has the required schema
    if (!convertedCollectionData.info.schema) {
      convertedCollectionData.info.schema = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
    }
    
    console.log('Creating new "latest" collection from OpenAPI conversion...');
    const newLatestCollection = await createCollection(convertedCollectionData);
    
    console.log(`Successfully created new latest collection: ${newLatestCollection.name} (UID: ${newLatestCollection.uid})`);
    console.log(`\nSummary:`);
    console.log(`- Renamed existing "latest" to "${versionedName}"`);
    console.log(`- Created new "latest" from OpenAPI conversion`);
    console.log(`- New latest collection UID: ${newLatestCollection.uid}`);
    
    // Output the new UID for potential use in subsequent workflow steps
    console.log(`::set-output name=new_collection_uid::${newLatestCollection.uid}`);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();