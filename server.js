const {disconnectFromMongoDB} = require("./src/config/mongo-server");
const {initializeDatabase} = require("./src/config/database");
const {createApp} = require("./src/app");

const port = process.env.PORT || 8080;

let server;
let mongoClient;
let isShuttingDown = false;

async function startServer() {
    const database = await initializeDatabase();

    mongoClient = database.mongoClient;

    const app = createApp(database);

    server = app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

async function shutdown(exitCode = 0) {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;

    console.log("Shutting down server...");

    try {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        if (mongoClient) {
            await disconnectFromMongoDB();
            console.log("MongoDB disconnected successfully");
        }

    } catch (err) {
        console.error("Error during shutdown:", err);
        exitCode = 1;
    }

    process.exitCode = exitCode;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

startServer().catch(async (err) => {
    console.error("Failed to start server:", err);
    await shutdown(1);
});
