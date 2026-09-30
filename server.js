const { connectToMongoDB } = require('./src/mongo-server');
const { ObjectId } = require('mongodb');
const express = require('express');

const app = express();
const port = process.env.PORT || 8080;
app.use(express.json());

let database;

const REQUIRED_FIELDS = ["name", "price", "category"];

const productSchema = {
    $jsonSchema: {
        bsonType: "object",
        required: REQUIRED_FIELDS,
        properties: {
            name:     { bsonType: "string", minLength: 1, description: "name is required and must be a non-empty string" },
            price:    { bsonType: ["double", "int", "long", "decimal"], minimum: 0, description: "price is required and must be a positive number" },
            category: { bsonType: "string", minLength: 1, description: "category is required and must be a non-empty string" }
        }
    }
};

function validateProduct(body) {
    const missing = REQUIRED_FIELDS.filter(
        f => body[f] === undefined || body[f] === null || body[f] === ""
    );
    if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
    if (typeof body.name !== "string") return "name must be a string";
    if (typeof body.category !== "string") return "category must be a string";
    if (typeof body.price !== "number" || body.price < 0) return "price must be a positive number";
    return null;
}

function handleError(err, res) {
    // 121 = DocumentValidationFailed (rejected by the collection's $jsonSchema)
    if (err.code === 121) {
        return res.status(400).json({ error: "Document failed validation", details: err.errInfo });
    }
    console.error(err);
    res.status(500).json({error: "Internal server error"});
}

async function startServer(){
    const client = await connectToMongoDB();
    database = client.db(process.env.DB_NAME || "HAC_PRODUCT");

    try {
        const existing = await database.listCollections({ name: "products" }).toArray();
        if (existing.length === 0) {
            await database.createCollection("products", { validator: productSchema });
        } else {
            await database.command({ collMod: "products", validator: productSchema });
        }
    } catch (err) {
        // The DB user may lack the collMod/createCollection privilege (e.g. on Atlas)
        console.warn(`Could not apply schema validator: ${err.message}. Falling back to app-level validation only.`);
    }

    const productsCollection = database.collection("products");

    app.post("/products", async (req, res) => {
        try{
            const error = validateProduct(req.body);
            if (error) {
                return res.status(400).json({ error });
            }

            const product = {
                ...req.body,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const result = await productsCollection.insertOne(product);
            res.status(201).json({ message: "Product created successfully", productId: result.insertedId });
        }
        catch(err){
            handleError(err, res);
        }
    })

    app.get("/products", async (req, res) => {
        try{
            const products = await productsCollection.find({}).toArray();
            res.status(200).json(products);
        }
        catch(err){
            console.error(err);
            res.status(500).json({error: "Internal server error"});
        }
    })

    app.get("/products/:id", async (req, res) => {
        try{
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ error: "Invalid product ID" });
            }
            const product = await productsCollection.findOne({ _id: new ObjectId(id) });
            if (!product) {
                return res.status(404).json({ error: "Product not found" });
            }
            res.status(200).json(product);
        }
        catch(err){
            console.error(err);
            res.status(500).json({error: "Internal server error"});
        }
    })

    app.patch("/products/:id", async (req, res) => {
        try {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ error: "Invalid product ID" });
            }

            const updates = { ...req.body };
            delete updates._id;

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ error: "No fields provided for update" });
            }

            const result = await productsCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        ...updates,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: "Product not found" });
            }

            res.status(200).json({ message: "Product updated successfully" });
        }
        catch(err){
            handleError(err, res);
        }
    })

    app.put("/products/:id", async (req, res) => {
        try{
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ error: "Invalid product ID" });
            }

            const error = validateProduct(req.body);
            if (error) {
                return res.status(400).json({ error });
            }

            const updatedData = { ...req.body };
            delete updatedData._id;

            const existingProduct = await productsCollection.findOne({ _id: new ObjectId(id) });

            if (!existingProduct) {
                const product = {
                    _id: new ObjectId(id),
                    ...updatedData,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                const result = await productsCollection.insertOne(product);
                return res.status(201).json({ message: "Product created successfully", productId: result.insertedId });
            }

            const replacementDocument = {
                ...updatedData,
                createdAt: existingProduct.createdAt,
                updatedAt: new Date()
            };

            await productsCollection.replaceOne({ _id: new ObjectId(id) }, replacementDocument);

            res.status(200).json({ message: "Product replaced successfully" });
        }
        catch(err){
            handleError(err, res);
        }
    })

    app.delete("/products/:id", async (req, res) => {
        try {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ error: "Invalid product ID" });
            }
            const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: "Product not found" });
            }
            res.status(200).json({ message: "Product deleted successfully" });
        }
        catch(err){
            console.error(err);
            res.status(500).json({error: "Internal server error"});
        }
    })

    app.listen(port, () => console.log(`Server running on port ${port}`))
}

startServer()
