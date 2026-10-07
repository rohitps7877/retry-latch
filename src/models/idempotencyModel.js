
import mongoose from "mongoose";

const idempotencySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    payloadHash: {
        type: String,
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true
    },
    responseStatus: {
        type: Number,
        required: true
    },
    responseBody: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
}, {
    timestamps: true
});

const IdempotencyRecord = mongoose.model("IdempotencyRecord", idempotencySchema);

export default IdempotencyRecord;