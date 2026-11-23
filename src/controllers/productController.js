
const { ObjectId } = require("mongodb");
const { validator } = require("../middleware/validator");
const { handleError } = require("../middleware/errorhandler");

function createProductController(productsCollection, schemaProducts) {

    async function createProduct(req, res) {
        try {
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

            return res.status(201).json({
                message: "Product created successfully",
                productId: result.insertedId
            });

        } catch (err) {
            return handleError(err, res);
        }
    }

    async function getProducts(req, res) {
        try {
            const products = await productsCollection.find({}).toArray();
            return res.status(200).json(products);

        } catch (err) {
            return handleError(err, res);
        }
    }
    async function getProductById(req, res) {
        try {
            const { id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "Invalid product ID"
                });
            }

            const product = await productsCollection.findOne({
                _id: new ObjectId(id)
            });

            if (!product) {
                return res.status(404).json({
                    error: "Product not found"
                });
            }

            return res.status(200).json(product);

        } catch (err) {
            return handleError(err, res);
        }
    }

    async function updateProduct(req, res) {
        try {
            const { id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "Invalid product ID"
                });
            }

            const updates = { ...req.body };
            delete updates._id;

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    error: "No fields provided for update"
                });
            }

            const error = validator(
                updates,
                { ...schemaProducts, required: [] }
            );

            if (error) {
                return res.status(400).json({ error });
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
                return res.status(404).json({
                    error: "Product not found"
                });
            }

            return res.status(200).json({
                message: "Product updated successfully"
            });

        } catch (err) {
            return handleError(err, res);
        }
    }

    async function replaceProduct(req, res) {
        try {
            const { id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "Invalid product ID"
                });
            }

            const error = validator(req.body, schemaProducts);

            if (error) {
                return res.status(400).json({ error });
            }

            const updatedData = { ...req.body };
            delete updatedData._id;

            const objectId = new ObjectId(id);

            const existingProduct = await productsCollection.findOne({
                _id: objectId
            });

            if (!existingProduct) {
                const product = {
                    _id: objectId,
                    ...updatedData,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const result = await productsCollection.insertOne(product);

                return res.status(201).json({
                    message: "Product created successfully",
                    productId: result.insertedId
                });
            }

            const replacementDocument = {
                ...updatedData,
                createdAt: existingProduct.createdAt,
                updatedAt: new Date()
            };

            await productsCollection.replaceOne(
                { _id: objectId },
                replacementDocument
            );

            return res.status(200).json({
                message: "Product replaced successfully"
            });

        } catch (err) {
            return handleError(err, res);
        }
    }
    
    async function deleteProduct(req, res) {
        try {
            const { id } = req.params;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    error: "Invalid product ID"
                });
            }

            const result = await productsCollection.deleteOne({
                _id: new ObjectId(id)
            });

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    error: "Product not found"
                });
            }

            return res.status(204).send();

        } catch (err) {
            return handleError(err, res);
        }
    }

    return {
        createProduct,
        getProducts,
        getProductById,
        updateProduct,
        replaceProduct,
        deleteProduct
    };
}

module.exports = { createProductController };
