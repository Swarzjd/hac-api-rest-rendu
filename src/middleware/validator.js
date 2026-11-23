export function validator(body, schema) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Request body must be an object";
    }
    const missing = (schema.required ?? []).filter(
        field =>
            body[field] === undefined ||
            body[field] === null ||
            body[field] === ""
    );

    let errorMessage = {
        "failures": ""
    }

    if (missing.length > 0) {
        errorMessage.failures = `Missing required fields: ${missing.join(", ")}`;
        return errorMessage
    }

    for (const [field, rules] of Object.entries(schema.properties ?? {})) {
        const value = body[field];

        if (value === undefined) continue;

        const types = Array.isArray(rules.bsonType)
            ? rules.bsonType
            : [rules.bsonType];

        if (value === null) {
            errorMessage.failures = `${field} cannot be null`
            return errorMessage;
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
            errorMessage.failures = `${field} has an invalid type`;
            return errorMessage;
        }

        if (
            typeof value === "string" &&
            rules.minLength !== undefined &&
            value.length < rules.minLength
        ) {
            errorMessage.failures = `${field} must contain at least ${rules.minLength} characters`
            return errorMessage;
        }

        if (
            typeof value === "number" &&
            rules.minimum !== undefined &&
            value < rules.minimum
        ) {
            errorMessage.failures = `${field} must be at least ${rules.minimum}`
            return errorMessage;
        }
    }

    return null;
}

export async function validateSchema(client, DB_NAME, collection, schemaMongo) {
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
