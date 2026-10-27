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
