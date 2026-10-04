import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("connect", () => {
  console.log("PostgreSQL conectado.");
});

pool.on("error", (erro) => {
  console.error("Erro inesperado no PostgreSQL:", erro);
});

export default pool;