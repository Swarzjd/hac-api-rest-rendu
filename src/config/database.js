
const fs = require("fs");
const path = require("path");

const { connectToMongoDB } = require("./mongo-server");
const { validateSchema } = require("../middleware/validator");

async function initializeDatabase() {
    const mongoClient = await connectToMongoDB();

    try {
        const schemaProducts = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, "../schema/product.json"),
                "utf8"
            )
        );

        const schemaUsers = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, "../schema/user.json"),
                "utf8"
            )
        );

        const schemaTov = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, "../schema/tov.json"),
                "utf8"
            )
        );

        const productsDB = await validateSchema(
            mongoClient,
            process.env.DB_NAME_PRODUCTS,
            "products",
            { $jsonSchema: schemaProducts }
        );

        const usersDB = await validateSchema(
            mongoClient,
            process.env.DB_NAME_USERS,
            "users",
            { $jsonSchema: schemaUsers }
        );

        const tovDB = await validateSchema(
            mongoClient,
            process.env.DB_NAME_TOV,
            "tableOfValues",
            { $jsonSchema: schemaTov }
        );

        const productsCollection = productsDB.collection("products");
        const usersCollection = usersDB.collection("users");
        const tovCollection = tovDB.collection("tableOfValues");

        await usersCollection.createIndex(
            { email: 1 },
            { unique: true }
        );

        return {
            mongoClient,
            productsCollection,
            usersCollection,
            tovCollection,
            schemaProducts,
            schemaUsers
        };

    } catch (err) {
        await mongoClient.close();
        throw err;
    }
}

module.exports = { initializeDatabase };
