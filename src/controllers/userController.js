
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { validator } = require("../middleware/validator");
const { handleError } = require("../middleware/errorhandler");

function createUserController(usersCollection, schemaUsers) {

    // POST /users/register
    async function registerUser(req, res) {
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

            // Password validation
            if (
                typeof password !== "string" ||
                password.length < 12 ||
                Buffer.byteLength(password, "utf8") > 72
            ) {
                return res.status(400).json({
                    error: "Password must be at least 12 characters and no more than 72 UTF-8 bytes"
                });
            }

            // Email validation
            if (
                typeof email !== "string" ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
            ) {
                return res.status(400).json({
                    error: "A valid email is required"
                });
            }

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

            // Hash password
            const hashedPassword = await bcrypt.hash(
                password,
                Number(process.env.SALT_ROUNDS) || 12
            );

            const userType = {
                tableOfValuesCode: "3",
                tableOfValuesTable: "userType"
            };

            const user = {
                name: name.trim(),
                surname: surname.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                birthDate: parsedBirthDate,
                ...(name2 !== undefined && { name2 }),
                ...(name3 !== undefined && { name3 }),
                userType,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await usersCollection.insertOne(user);

            return res.status(201).json({
                message: "User registered successfully",
                userId: result.insertedId
            });

        } catch (err) {
            // MongoDB duplicate-key error
            if (err.code === 11000) {
                return res.status(409).json({
                    error: "An account with this email already exists"
                });
            }

            return handleError(err, res);
        }
    }

    // POST /users/login
    async function loginUser(req, res) {
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
                {
                    expiresIn: process.env.JWT_EXPIRES_IN || "1h"
                }
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
    }

    return {
        registerUser,
        loginUser
    };
}

module.exports = { createUserController };
