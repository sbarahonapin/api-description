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
      const versionString = `${version.major}.${version.minor}.${version.patch}`;
      const highestString = highestVersion ? 
        `${highestVersion.major}.${highestVersion.minor}.${highestVersion.patch}` : '0.0.0';
      
      if (versionString > highestString) {
        highestVersion = version;
      }
    }
  });
  
  if (!highestVersion) return '1.0.0';
  
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
    
    // Step 1: Get the current content of the "latest" collection
    console.log('Fetching current "latest" collection content...');
    const currentLatestContent = await getCollection(latestCollection.uid);
    
    // Step 2: Create a new versioned collection with the current content
    console.log(`Creating versioned collection "${versionedName}" with current content...`);
    const versionedCollectionData = {
      ...currentLatestContent,
      info: {
        ...currentLatestContent.info,
        name: versionedName
      }
    };
    
    // Remove uid and id as they shouldn't be in create payload
    delete versionedCollectionData.uid;
    delete versionedCollectionData.id;
    
    const versionedCollection = await createCollection(versionedCollectionData);
    console.log(`Successfully created versioned collection: ${versionedCollection.name} (UID: ${versionedCollection.uid})`);
    
    // Step 3: Update the "latest" collection with the new OpenAPI conversion
    console.log('Reading converted collection from OpenAPI...');
    const convertedCollectionPath = './postman/collection.json';
    const convertedCollectionData = JSON.parse(await fs.readFile(convertedCollectionPath, 'utf8'));
    
    // Ensure the converted collection has the correct name and schema
    if (!convertedCollectionData.info) {
      convertedCollectionData.info = {};
    }
    convertedCollectionData.info.name = 'Pinterest REST API (latest)';
    
    if (!convertedCollectionData.info.schema) {
      convertedCollectionData.info.schema = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
    }
    
    // Remove uid and id from the converted data
    delete convertedCollectionData.uid;
    delete convertedCollectionData.id;
    
    console.log('Updating "latest" collection with OpenAPI conversion...');
    await updateCollection(latestCollection.uid, convertedCollectionData);
    
    console.log(`Successfully updated "latest" collection with new content`);
    console.log(`\nSummary:`);
    console.log(`- Created versioned snapshot: "${versionedName}" (UID: ${versionedCollection.uid})`);
    console.log(`- Updated "latest" collection with OpenAPI conversion (UID: ${latestCollection.uid})`);
    console.log(`- "Latest" collection UID remains: ${latestCollection.uid}`);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();