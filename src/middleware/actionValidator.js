import { ObjectId } from "mongodb";

export function requireRole(usersCollection, allowedCodes) {
    return async (req, res, next) => {
        try {
            const userId = req.user?.sub;
            if (!userId || !ObjectId.isValid(userId)) {
                return res.status(401).json({ error: "Invalid token" });
            }

            const user = await usersCollection.findOne(
                { _id: new ObjectId(userId) },
                { projection: { userType: 1 } }
            );
            if (!user) {
                return res.status(401).json({ error: "User not found" });
            }

            const code = user.userType?.tableOfValuesCode;
            if (!allowedCodes.includes(code)) {
                return res.status(403).json({
                    error: "You do not have permission to perform this action"
                });
            }

            req.userType = user.userType;
            next();
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Internal server error" });
        }
    };
}