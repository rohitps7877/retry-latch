
import express from "express";
import {createOrder, getOrderById} from "../controllers/orderController.js";
import rateLimit from "../middleware/rateLimit.js";

const router = express.Router();

// Create a new order
router.post("/", rateLimit,createOrder);

// Get an order by ID
router.get("/:id", getOrderById);

export default router;