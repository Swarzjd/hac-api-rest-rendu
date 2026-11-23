const express = require("express");

const { createProductRouter } = require("./routes/productsRoutes");
const { createUserRouter } = require("./routes/usersRoutes");

function createApp({
                       productsCollection,
                       usersCollection,
                       schemaProducts,
                       schemaUsers
                   }) {
    const app = express();

    app.use(express.json());

    app.use(
        "/products",
        createProductRouter(
            productsCollection,
            usersCollection,
            schemaProducts
        )
    );

    app.use(
        "/users",
        createUserRouter(
            usersCollection,
            schemaUsers
        )
    );

    return app;
}

module.exports = { createApp };
