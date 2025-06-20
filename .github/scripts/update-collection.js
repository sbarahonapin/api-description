const axios = require('axios');
const fs = require('fs');

async function versionCollection() {
  try {
    console.log('Starting collection versioning process...');
    
    // Get all collections
    const collectionsResponse = await axios({
      method: 'get',
      url: 'https://api.getpostman.com/collections',
      headers: { 'X-Api-Key': process.env.POSTMAN_API_KEY }
    });

    const collections = collectionsResponse.data.collections;
    console.log('Found collections:', collections.map(c => c.name));

    // Always find the "latest" collection by name, not by UID
    // This ensures we always work with the current "latest" regardless of UID changes
    let currentCollection = collections.find(c => c.name === 'Pinterest REST API latest');
    
    // Fallback: if no "latest" exists, use COLLECTION_UID (for first-time setup)
    if (!currentCollection && process.env.COLLECTION_UID) {
      currentCollection = collections.find(c => c.uid === process.env.COLLECTION_UID);
      console.log('No "Pinterest REST API latest" collection found, using COLLECTION_UID as starting point');
    }
    
    if (!currentCollection) {
      throw new Error('Could not find "Pinterest REST API latest" collection or collection with COLLECTION_UID');
    }
    console.log('Current collection:', currentCollection.name, '(UID:', currentCollection.uid + ')');

    // Find highest version number from existing Pinterest REST API collections
    let highestVersion = { major: 5, minor: 14, patch: 0 }; // Start from 5.14.0 as example
    collections.forEach(collection => {
      // Look for "Pinterest REST API X.Y.Z" pattern
      const match = collection.name.match(/^Pinterest REST API (\d+)\.(\d+)\.(\d+)$/);
      if (match) {
        const version = {
          major: parseInt(match[1]),
          minor: parseInt(match[2]), 
          patch: parseInt(match[3])
        };
        if (version.major > highestVersion.major || 
            (version.major === highestVersion.major && version.minor > highestVersion.minor)) {
          highestVersion = version;
        }
      }
    });

    // Calculate next version (increment minor)
    const nextVersion = `${highestVersion.major}.${highestVersion.minor + 1}.${highestVersion.patch}`;
    const nextVersionName = `Pinterest REST API ${nextVersion}`;
    console.log('Next version:', nextVersionName);

    // Rename current collection to version number
    await axios({
      method: 'put',
      url: `https://api.getpostman.com/collections/${currentCollection.uid}`,
      headers: {
        'X-Api-Key': process.env.POSTMAN_API_KEY,
        'Content-Type': 'application/json'
      },
      data: { collection: { info: { name: nextVersionName } } }
    });
    console.log('Renamed current collection to:', nextVersionName);

    // Create new "Pinterest REST API latest" collection
    const newCollectionData = JSON.parse(fs.readFileSync('./postman/collection.json'));
    newCollectionData.info.name = 'Pinterest REST API latest';
    
    const createResponse = await axios({
      method: 'post',
      url: 'https://api.getpostman.com/collections',
      headers: {
        'X-Api-Key': process.env.POSTMAN_API_KEY,
        'Content-Type': 'application/json'
      },
      data: { collection: newCollectionData }
    });

    console.log('Created new "Pinterest REST API latest" collection');
    console.log('New collection UID:', createResponse.data.collection.uid);
    console.log('✅ Process complete! The "Pinterest REST API latest" collection is now ready for future updates.');
    console.log('Note: COLLECTION_UID secret can remain unchanged - script will always find "Pinterest REST API latest" by name.');
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

versionCollection();