const { MongoClient } = require('mongodb');

if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill in your connection string.");
}

const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

async function disconnectFromMongoDB() {
    await client.close();
}

module.exports = {
    connectToMongoDB,
    disconnectFromMongoDB
};