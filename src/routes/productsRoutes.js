
const express = require("express");

const { createProductController } = require("../controllers/productController");
const { authenticateToken } = require("../middleware/tokenVeryfier");
const { requireRole } = require("../middleware/actionValidator");

function createProductRouter(productsCollection, usersCollection, schemaProducts) {
    const router = express.Router();

    const canWrite = requireRole(usersCollection, ["1", "2"]);
    const adminOnly = requireRole(usersCollection, ["1"]);

    const {
        createProduct,
        getProducts,
        getProductById,
        updateProduct,
        replaceProduct,
        deleteProduct
    } = createProductController(productsCollection, schemaProducts);

    router.post("/", authenticateToken, canWrite, createProduct);

    router.get("/", getProducts);

    router.get("/:id", getProductById);

    router.patch("/:id", authenticateToken, canWrite, updateProduct);

    router.put("/:id", authenticateToken, canWrite, replaceProduct);

    router.delete("/:id", authenticateToken, adminOnly, deleteProduct);

    return router;
}

module.exports = { createProductRouter };
