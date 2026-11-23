
const express = require("express");

const { createUserController } = require("../controllers/userController");

function createUserRouter(usersCollection, schemaUsers) {
    const router = express.Router();

    const {
        registerUser,
        loginUser
    } = createUserController(usersCollection, schemaUsers);

    router.post("/register", registerUser);

    router.post("/login", loginUser);

    return router;
}

module.exports = { createUserRouter };
