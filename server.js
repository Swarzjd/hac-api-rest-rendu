const { connectToMongoDB } = require('./config/mongo-server');
const { ObjectId } = require('mongodb');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require("fs");
const bcrypt = require("bcrypt");

const app = express();
const port = process.env.PORT || 8080;
app.use(express.json());

const schemaProducts = JSON.parse(
    fs.readFileSync("./schema/product.json", "utf8")
)
const schemaUsers = JSON.parse(
    fs.readFileSync("./schema/user.json", "utf8")
)

const productSchemaMongo = {
    $jsonSchema : schemaProducts
}

const userSchemaMongo = {
    $jsonSchema : schemaUsers
}

function validator(body, schema) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Request body must be an object";
    }
    const missing = (schema.required ?? []).filter(
        field =>
            body[field] === undefined ||
            body[field] === null ||
            body[field] === ""
    );

    if (missing.length > 0) {
        return `Missing required fields: ${missing.join(", ")}`;
    }

    for (const [field, rules] of Object.entries(schema.properties ?? {})) {
        const value = body[field];

        if (value === undefined) continue;

        const types = Array.isArray(rules.bsonType)
            ? rules.bsonType
            : [rules.bsonType];

        if (value === null) {
            return `${field} cannot be null`;
        }

        if (types.length && !types.some(type => {
            switch (type) {
                case "string":
                    return typeof value === "string";
                case "int":
                    return Number.isInteger(value) &&
                        value >= -2147483648 &&
                        value <= 2147483647;
                case "long":
                case "double":
                case "decimal":
                    return typeof value === "number" &&
                        Number.isFinite(value);
                case "bool":
                    return typeof value === "boolean";
                case "object":
                    return typeof value === "object" &&
                        !Array.isArray(value);
                case "array":
                    return Array.isArray(value);
                default:
                    return true;
            }
        })) {
            return `${field} has an invalid type`;
        }

        if (
            typeof value === "string" &&
            rules.minLength !== undefined &&
            value.length < rules.minLength
        ) {
            return `${field} must contain at least ${rules.minLength} characters`;
        }

        if (
            typeof value === "number" &&
            rules.minimum !== undefined &&
            value < rules.minimum
        ) {
            return `${field} must be at least ${rules.minimum}`;
        }
    }

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

async function validateSchema(client, DB_NAME, collection, schemaMongo) {
    const database = client.db(DB_NAME);

    try {
        const existing = await database
            .listCollections({ name: collection })
            .toArray();

        if (existing.length === 0) {
            await database.createCollection(collection, {
                validator: schemaMongo,
                validationLevel: "strict",
                validationAction: "error"
            });
        } else {
            await database.command({
                collMod: collection,
                validator: schemaMongo,
                validationLevel: "strict",
                validationAction: "error"
            });
        }
    } catch (err) {
        console.warn(
            `Could not apply MongoDB schema to ${collection}: ${err.message}.`
        );
        throw err;
    }

    return database;
}


function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({
            error: "Authentication token required"
        });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            error: "Authentication is not configured"
        });
    }

    try {
        req.user = jwt.verify(
            token,
            process.env.JWT_SECRET,
            { algorithms: ["HS256"] }
        );

        next();
    } catch (err) {
        return res.status(401).json({
            error: "Invalid or expired token"
        });
    }
}

async function startServer(){
    const client = await connectToMongoDB();

    const productsDB = await validateSchema(
        client,
        process.env.DB_NAME_PRODUCTS,
        "products",
        productSchemaMongo
    );

    const usersDB = await validateSchema(
        client,
        process.env.DB_NAME_USERS,
        "users",
        userSchemaMongo
    );

    const productsCollection = productsDB.collection("products");
    const usersCollection = usersDB.collection("users");

    app.post("/products", async (req, res) => {
        try{
            const error = validator(req.body, schemaProducts);
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

    app.post("/users/register", async (req, res) => {
        try {
            const {
                name,
                name2,
                name3,
                surname,
                email,
                password,
                birthDate
            } = req.body;

            const error = validator(req.body, schemaUsers);

            if (error) {
                return res.status(400).json({ error });
            }

            if (
                typeof password !== "string" ||
                password.length < 12 ||
                Buffer.byteLength(password, "utf8") > 72
            ) {
                return res.status(400).json({
                    error: "Password must be at least 12 characters and no more than 72 UTF-8 bytes"
                });
            }

            if (typeof email !== "string" ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                return res.status(400).json({
                    error: "A valid email is required"
                });
            }

            // Convert the JSON date string into a Date
            const parsedBirthDate = new Date(birthDate);

            if (
                typeof birthDate !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
                Number.isNaN(parsedBirthDate.getTime()) ||
                parsedBirthDate.toISOString().slice(0, 10) !== birthDate
            ) {
                return res.status(400).json({
                    error: "birthDate must be a valid date in YYYY-MM-DD format"
                });
            }

            const normalizedEmail = email.trim().toLowerCase();

            const existingUser = await usersCollection.findOne({
                email: normalizedEmail
            });

            if (existingUser) {
                return res.status(409).json({
                    error: "An account with this email already exists"
                });
            }

            const hashedPassword = await bcrypt.hash(
                password,
                process.env.SALT_ROUNDS
            );

            const user = {
                name: name.trim(),
                surname: surname.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                birthDate: parsedBirthDate,
                ...(name2 !== undefined && { name2 }),
                ...(name3 !== undefined && { name3 }),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await usersCollection.insertOne(user);

            return res.status(201).json({
                message: "User registered successfully",
                userId: result.insertedId
            });
        } catch (err) {
            if (err.code === 11000) {
                return res.status(409).json({
                    error: "An account with this email already exists"
                });
            }

            return handleError(err, res);
        }
    });

    app.post("/users/login", async (req, res) => {
        try {
            const { email, password } = req.body;

            if (
                typeof email !== "string" ||
                typeof password !== "string" ||
                !email.trim() ||
                !password
            ) {
                return res.status(400).json({
                    error: "Email and password are required"
                });
            }

            if (!process.env.JWT_SECRET) {
                throw new Error("JWT_SECRET is not configured");
            }

            const user = await usersCollection.findOne({
                email: email.trim().toLowerCase()
            });

            if (!user) {
                return res.status(401).json({
                    error: "Invalid email or password"
                });
            }

            const passwordMatches = await bcrypt.compare(
                password,
                user.password
            );

            if (!passwordMatches) {
                return res.status(401).json({
                    error: "Invalid email or password"
                });
            }

            const token = jwt.sign(
                { sub: user._id.toString() },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
            );

            const decoded = jwt.decode(token);
            const expiresAt = new Date(decoded.exp * 1000);

            const parisTime = expiresAt.toLocaleString("sv-SE", {
                timeZone: "Europe/Paris"
            });

            return res.status(200).json({
                message: "Login successful",
                token,
                tokenType: "Bearer",
                expiresAt: parisTime,
                user: {
                    id: user._id,
                    name: user.name,
                    surname: user.surname,
                    email: user.email
                }
            });

        } catch (err) {
            return handleError(err, res);
        }
    });

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

    app.patch("/products/:id", authenticateToken,async (req, res) => {
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

    app.put("/products/:id", authenticateToken,async (req, res) => {
        try{
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ error: "Invalid product ID" });
            }

            const error = validator(req.body);
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

    app.delete("/products/:id", authenticateToken,async (req, res) => {
        try {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ error: "Invalid product ID" });
            }
            const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: "Product not found" });
            }
            res.status(204).json({ message: "Product deleted successfully" });
        }
        catch(err){
            console.error(err);
            res.status(500).json({error: "Internal server error"});
        }
    })

    app.listen(port, () => console.log(`Server running on port ${port}`))
}

startServer()
