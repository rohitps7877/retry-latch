import express from "express";
import orderRoutes from "./routes/orderRoutes.js";

const app = express();

// Middleware to read JSON data
app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({
        message: "RetryLatch server is healthy",
        server: process.env.SERVER_NAME
    });
});

// Order routes
app.use("/api/orders", orderRoutes);

export default app;