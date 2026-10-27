import jwt from "jsonwebtoken";

export async function authenticateToken(req, res, next) {
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
