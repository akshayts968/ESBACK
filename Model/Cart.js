const mongoose = require("mongoose");
const Product = require("./Product");
const Cart = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  quantity: { type: Number, default: 1 },
});

module.exports = mongoose.model("Cart", Cart);
