const express = require("express");
const cors = require("cors");

const app = express();

// For local learning only. Restrict this to the actual frontend origin before deployment.
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Stock inventory API is running" });
});

// Add product, sales and reports routes here.

module.exports = app;
