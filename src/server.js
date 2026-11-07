const app = require("./app");
const { initializeDatabase, pool } = require("./db");

const PORT = process.env.PORT || 3000;

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));
  })
  .catch(async error => {
    console.error("Could not connect to Neon or initialize the schema:", error.message);
    await pool.end();
    process.exit(1);
  });
