import pkg from "pg";
import dotenv from "dotenv";

dotenv.config(); // Carga las variables de entorno desde .env

const { Pool } = pkg; // Extrae Pool correctamente

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Usa la URL segura de Supabase
  ssl: { rejectUnauthorized: false }, // Necesario para Supabase
});

export default pool;

