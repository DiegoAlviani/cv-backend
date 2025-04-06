import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import pool from "./db.js"; // Importamos la conexión
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config(); // Carga las variables de entorno

const app = express();
const PORT = process.env.PORT || 5000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

app.use(cors());
app.use(express.json());

app.post("/visitors", async (req, res) => {
    const { ip, city, region, country, org, timestamp, loc } = req.body;
    try {
      await pool.query(
        `INSERT INTO visitors (ip, city, region, country, org, timestamp, loc, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)`,
        [ip, city, region, country, org, timestamp, loc]
      );
  
      // 🔵 Mensaje en consola del servidor
      console.log(`📍 Nuevo visitante: ${city}, ${region}, ${country} | IP: ${ip}`);
  
      res.status(200).json({ message: "Visitor logged ✅" });
    } catch (err) {
      console.error("❌ Error al guardar visitante:", err);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  });
  
  
  
  app.get("/visitors/stats", async (req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const today = now.toISOString().split("T")[0];

      // 🟢 Visitantes del mes actual
        const monthQuery = await pool.query(
            `SELECT * FROM visitors WHERE TO_CHAR(date, 'YYYY-MM') = $1`,
            [`${year}-${month}`]
        );
        
        // 🔵 Visitantes de hoy
        const todayQuery = await pool.query(
            `SELECT * FROM visitors WHERE date = $1`,
            [today]
        );
  
      // 🌍 Historial de países y ciudades
      const countryStats = await pool.query(
        `SELECT country, city, COUNT(*) AS count
         FROM visitors
         GROUP BY country, city`
      );
  
      // 📍 Todas las ubicaciones con coordenadas
      const locQuery = await pool.query(`
        SELECT city, country, loc, org, COUNT(*) AS count
        FROM visitors
        WHERE loc IS NOT NULL
        GROUP BY city, country, loc, org
      `);      

      const countries = {};
      countryStats.rows.forEach((row) => {
        const key = `${row.country} - ${row.city}`;
        countries[key] = parseInt(row.count);
      });
  
      const locations = locQuery.rows.map((row) => ({
        city: row.city,
        country: row.country,
        loc: row.loc,
      }));
  
      res.json({
        monthlyUsers: monthQuery.rowCount,
        todayUsers: todayQuery.rowCount,
        countries,
        locations: locQuery.rows.map((row) => ({
          city: row.city,
          country: row.country,
          loc: row.loc,
          org: row.org,
          count: parseInt(row.count)
        }))
      });
      
  
    } catch (err) {
      console.error("❌ Error en /visitors/stats:", err);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  });
  
  
const updateExchangeRates = async () => {
    const today = new Date().toISOString().split("T")[0]; // 📆 Fecha actual en formato YYYY-MM-DD

    try {
        // 🔹 Verificamos si las tasas ya se actualizaron hoy en PostgreSQL
        const checkUpdate = await pool.query("SELECT MAX(last_updated)::TEXT AS last_updated FROM exchange_rates");
        const lastUpdated = checkUpdate.rows[0].last_updated; // Ya es un string 'YYYY-MM-DD'

        // ✅ Si las tasas ya fueron actualizadas hoy, NO hacemos la petición a la API
        if (lastUpdated === today) {
            console.log("✅ Las tasas ya están actualizadas para hoy. No se realiza una nueva petición.");
            return;
        }

        console.log("🔄 Obteniendo tasas de cambio desde la API...");

        // 🏦 Petición a la API de tasas de cambio
        const apiBaseUrl = process.env.EXCHANGE_API_BASE_URL;
        const apiKey = process.env.EXCHANGE_API_KEY;
        const response = await fetch(`${apiBaseUrl}/EUR?apikey=${apiKey}`);
        if (!response.ok) throw new Error("Error en la API de tasas de cambio.");

        const data = await response.json();
        if (!data.rates) throw new Error("No se pudieron obtener las tasas de cambio.");

        // 🔄 Insertamos o actualizamos las tasas en la base de datos
        for (const [currency, rate] of Object.entries(data.rates)) {
            await pool.query(
                `INSERT INTO exchange_rates (currency, rate, last_updated) 
                VALUES ($1, $2, $3) 
                ON CONFLICT (currency) 
                DO UPDATE SET rate = EXCLUDED.rate, last_updated = EXCLUDED.last_updated`,
                [currency, rate, today]
            );
        }

        console.log("✅ Tasas de cambio actualizadas correctamente en PostgreSQL.");
    } catch (error) {
        console.error("❌ Error al actualizar las tasas de cambio:", error);
    }
};

// 📌 Endpoint para iniciar sesión
app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    res.json({ message: "Login exitoso", session: data.session });
});


// 📌 Endpoint para cerrar sesión
app.post("/auth/logout", async (req, res) => {
    await supabase.auth.signOut();
    res.json({ message: "Logout exitoso" });
});


app.get("/exchange-rates", async (req, res) => {
    try {
      await updateExchangeRates(); // 🛠️ Intenta actualizar primero
  
      const ratesQuery = await pool.query("SELECT * FROM exchange_rates");
  
      if (ratesQuery.rows.length === 0) {
        return res.status(404).json({ error: "No hay tasas de cambio disponibles." });
      }
  
      const rates = ratesQuery.rows.reduce((acc, row) => {
        acc[row.currency] = row.rate;
        return acc;
      }, {});
  
      res.json({ rates });
  
    } catch (error) {
      console.error("❌ Error al obtener tasas de cambio:", error);
      res.status(500).json({ error: "Error al obtener tasas de cambio." });
    }
  });
  
app.post("/exchange-rates", async (req, res) => {
    try {
        await updateExchangeRates();
        res.json({ message: "✅ Tasas de cambio actualizadas correctamente." });
    } catch (error) {
        res.status(500).json({ error: "❌ Error al actualizar las tasas de cambio." });
    }
});


// Función para filtrar datos según el idioma
const filterByLanguage = (rows, lang, isDictionary = false) => {
    return rows.map((row) => {
        if (isDictionary) {
            // 🔹 Manejo especial para `dictionary`
            return {
                key: row.key,
                text: row[lang] || row["en"] // Usa inglés como fallback si el idioma no existe
            };
        } else {
            // 🔹 Filtrar normalmente para `experience`, `projects`, `skills`, etc.
            const newItem = {};
            for (const key in row) {
                if (key.endsWith(`_${lang}`)) {
                    newItem[key.replace(`_${lang}`, "")] = row[key];
                }
            }
            return newItem;
        }
    });
};





// Endpoint para obtener el CV según el idioma
app.get("/cv", async (req, res) => {
    try {
        const lang = req.query.lang || "en"; // Idioma por defecto inglés
        const currentMonthYear = new Date().toISOString().slice(0, 7); // 📆 YYYY-MM

        // 🔹 Consultar experiencia desde PostgreSQL asegurando que `id` esté presente
        const experience = await pool.query(`
            SELECT id, 
                   company_${lang} AS company, 
                   role_${lang} AS role, 
                   duration_${lang} AS duration, 
                   description_${lang} AS description
            FROM experience
        `);

        const education = await pool.query(`
            SELECT id, 
                   institution_${lang} AS institution, 
                   degree_${lang} AS degree, 
                   duration 
            FROM education
        `);

        const projects = await pool.query(`
            SELECT id, 
                   name_${lang} AS name, 
                   description_${lang} AS description, 
                   technologies, 
                   link 
            FROM projects
        `);

        const skills = await pool.query(`
            SELECT id, 
                   category_${lang} AS category, 
                   skills 
            FROM skills
        `);

        const languages = await pool.query(`
            SELECT id, 
                   language_${lang} AS language, 
                   level_${lang} AS level 
            FROM languages
        `);

        const dictionaryRows = await pool.query("SELECT * FROM dictionary");

        // 🔹 Consultar datos financieros actuales (income + expenses)
        const incomeQuery = await pool.query("SELECT * FROM income WHERE month_year = $1", [currentMonthYear]);
        const expensesQuery = await pool.query("SELECT * FROM expenses WHERE month_year = $1", [currentMonthYear]);

        // 🔹 Convertir `dictionary` de un array a un objeto
        const dictionary = {};
        dictionaryRows.rows.forEach(item => {
            dictionary[item.key] = item[lang] || item["en"];
        });

        // 🔹 Devolvemos la respuesta con los datos ya estructurados en el idioma solicitado
        res.json({
            experience: experience.rows,
            education: education.rows,
            projects: projects.rows,
            skills: skills.rows,
            languages: languages.rows,
            dictionary,
            finance: {
                income: incomeQuery.rows[0] || { amount: 0, currency: "EUR" },
                expenses: expensesQuery.rows || []
            }
        });

    } catch (error) {
        console.error("❌ Error al obtener los datos del CV:", error);
        res.status(500).json({ message: "❌ Error al obtener los datos del CV." });
    }
});

// 🔹 Endpoint para agregar una nueva experiencia (en todos los idiomas)
app.post("/cv/experience", async (req, res) => {
    const newExperience = req.body; // 🔹 Recibe todos los datos de experiencia

    // 🔹 Verificar que se proporcionaron todos los campos requeridos
    const requiredFields = [
        "company_en", "company_es", "company_it",
        "role_en", "role_es", "role_it",
        "duration_en", "duration_es", "duration_it",
        "description_en", "description_es", "description_it"
    ];

    for (const field of requiredFields) {
        if (!newExperience[field] || newExperience[field].trim() === "") {
            return res.status(400).json({ error: `❌ El campo '${field}' es obligatorio.` });
        }
    }

    try {
        // 🔹 Construir la consulta de inserción
        const query = `
            INSERT INTO experience (
                company_en, company_es, company_it,
                role_en, role_es, role_it,
                duration_en, duration_es, duration_it,
                description_en, description_es, description_it
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `;

        // 🔹 Insertar los valores en el orden correcto
        const values = [
            newExperience.company_en, newExperience.company_es, newExperience.company_it,
            newExperience.role_en, newExperience.role_es, newExperience.role_it,
            newExperience.duration_en, newExperience.duration_es, newExperience.duration_it,
            newExperience.description_en, newExperience.description_es, newExperience.description_it
        ];

        // 🔄 Ejecutar la inserción
        const newExp = await pool.query(query, values);

        res.json({
            message: "✅ Nueva experiencia agregada correctamente.",
            experience: newExp.rows[0]
        });

    } catch (error) {
        console.error("❌ Error al agregar la experiencia:", error);
        res.status(500).json({ error: "❌ Error al insertar la experiencia en la base de datos." });
    }
});



// Endpoint para eliminar una experiencia por ID
app.delete("/cv/experience/:id", async (req, res) => {
    const { id } = req.params;

    try {
        // Verificar si la experiencia existe antes de eliminar
        const checkExperience = await pool.query("SELECT * FROM experience WHERE id = $1", [id]);

        if (checkExperience.rows.length === 0) {
            return res.status(404).json({ error: `❌ No se encontró la experiencia con ID ${id}.` });
        }

        // Eliminar la experiencia
        await pool.query("DELETE FROM experience WHERE id = $1", [id]);

        res.json({ message: `✅ Experiencia con ID ${id} eliminada correctamente.` });
    } catch (error) {
        console.error("❌ Error al eliminar la experiencia:", error);
        res.status(500).json({ error: "❌ Error al eliminar la experiencia en la base de datos." });
    }
});



// Endpoint para actualizar Experience (id, lang)
app.put("/cv/experience/:id/:lang", async (req, res) => {
    const experienceId = parseInt(req.params.id, 10);
    const lang = req.params.lang.toLowerCase(); // 🔹 Convertimos a minúscula para evitar errores
    const updatedFields = req.body; // 🔹 Contiene solo los valores a actualizar

    // 🔹 Verificar que el idioma sea válido
    if (!["en", "es", "it"].includes(lang)) {
        return res.status(400).json({ error: "❌ Idioma no válido. Debe ser 'en', 'es' o 'it'." });
    }

    // 🔹 Verificar que `updatedFields` no esté vacío
    if (!updatedFields || Object.keys(updatedFields).length === 0) {
        return res.status(400).json({ error: "❌ No se proporcionaron datos para actualizar." });
    }

    try {
        // 🔍 Verificar si la experiencia con el ID existe
        const checkExperience = await pool.query("SELECT * FROM experience WHERE id = $1", [experienceId]);
        if (checkExperience.rows.length === 0) {
            return res.status(404).json({ error: "❌ No se encontró la experiencia con el ID proporcionado." });
        }

        // 🔄 Construimos dinámicamente la consulta UPDATE solo con los campos válidos
        let updateQuery = "UPDATE experience SET ";
        const values = [];
        let counter = 1;

        for (const key in updatedFields) {
            // 🔹 Solo actualizar los campos permitidos (excluyendo `id`)
            if (["company", "role", "duration", "description"].includes(key)) {
                updateQuery += `${key}_${lang} = $${counter}, `;
                values.push(updatedFields[key]);
                counter++;
            }
        }

        // 🔹 Si no hay campos válidos para actualizar, devolver error
        if (values.length === 0) {
            return res.status(400).json({ error: "❌ No se proporcionaron campos válidos para actualizar." });
        }

        // 🔹 Eliminamos la última coma y agregamos la condición WHERE
        updateQuery = updateQuery.slice(0, -2) + ` WHERE id = $${counter} RETURNING *;`;
        values.push(experienceId);

        // 🔄 Ejecutar la actualización en la base de datos
        const updatedExperience = await pool.query(updateQuery, values);

        res.json({ 
            message: `✅ Experiencia con ID ${experienceId} actualizada en el idioma ${lang}`, 
            updatedExperience: updatedExperience.rows[0]
        });
    } catch (error) {
        console.error("❌ Error al actualizar la experiencia:", error);
        res.status(500).json({ error: "❌ Error interno del servidor." });
    }
});

// Endpoint para agregar una nueva educación con soporte multilingüe
app.post("/cv/education", async (req, res) => {
    const { institution_en, institution_es, institution_it, degree_en, degree_es, degree_it, duration } = req.body;

    // Validar que todos los campos estén llenos
    if (!institution_en || !institution_es || !institution_it || 
        !degree_en || !degree_es || !degree_it || !duration) {
        return res.status(400).json({ error: "❌ Todos los campos deben estar completos." });
    }

    try {
        // 🔹 Insertar en la base de datos con los tres idiomas
        const newEducation = await pool.query(
            `INSERT INTO education (institution_en, institution_es, institution_it, degree_en, degree_es, degree_it, duration)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [institution_en, institution_es, institution_it, degree_en, degree_es, degree_it, duration]
        );

        res.json({
            message: "✅ Nueva educación agregada.",
            education: newEducation.rows[0]
        });

    } catch (error) {
        console.error("❌ Error al agregar la educación:", error);
        res.status(500).json({ error: "❌ Error al agregar la educación en la base de datos." });
    }
});


// 📌 Endpoint para eliminar una educación
app.delete("/cv/education/:id", async (req, res) => {
    const { id } = req.params;

    try {
        // Verificar si el registro existe antes de eliminar
        const checkData = await pool.query(`SELECT * FROM education WHERE id = $1`, [id]);

        if (checkData.rows.length === 0) {
            return res.status(404).json({ error: `❌ No se encontró la educación con ID ${id}.` });
        }

        // Eliminar el registro
        await pool.query(`DELETE FROM education WHERE id = $1`, [id]);

        res.json({ message: `✅ Educación con ID ${id} eliminada correctamente.` });
    } catch (error) {
        console.error("❌ Error al eliminar la educación:", error);
        res.status(500).json({ error: "❌ Error al eliminar la educación en la base de datos." });
    }
});

// Endpoint para actualizar un idioma específico de un registro en educación
app.put("/cv/education/:id/:lang", async (req, res) => {
    const educationId = parseInt(req.params.id, 10);
    const lang = req.params.lang.toLowerCase(); // 🔹 Convertimos a minúscula para evitar errores
    const updatedFields = req.body; // 🔹 Contiene solo los valores a actualizar

    if (!["en", "es", "it"].includes(lang)) {
        return res.status(400).json({ error: "❌ Idioma no válido. Debe ser 'en', 'es' o 'it'." });
    }

    // 🔹 Verificar que `updatedFields` no esté vacío
    if (!updatedFields || Object.keys(updatedFields).length === 0) {
        return res.status(400).json({ error: "❌ No se proporcionaron datos para actualizar." });
    }

    try {
        // 🔍 Verificar si el registro de educación con el ID existe
        const checkEducation = await pool.query("SELECT * FROM education WHERE id = $1", [educationId]);
        if (checkEducation.rows.length === 0) {
            return res.status(404).json({ error: "❌ No se encontró la educación con el ID proporcionado." });
        }

        // 🔄 Construimos dinámicamente la consulta UPDATE solo con los campos válidos
        let updateQuery = "UPDATE education SET ";
        const values = [];
        let counter = 1;

        for (const key in updatedFields) {
            if (key === "duration") {
                // 🔹 `duration` no tiene variaciones por idioma, se actualiza sin `_en`, `_es`, `_it`
                updateQuery += `${key} = $${counter}, `;
            } else if (["institution", "degree"].includes(key)) {
                // 🔹 Campos multilingües llevan `_en`, `_es`, `_it`
                updateQuery += `${key}_${lang} = $${counter}, `;
            } else {
                return res.status(400).json({ error: `❌ El campo '${key}' no es válido para actualizar.` });
            }
            values.push(updatedFields[key]);
            counter++;
        }

        // 🔹 Si no hay campos válidos para actualizar, devolver error
        if (values.length === 0) {
            return res.status(400).json({ error: "❌ No se proporcionaron campos válidos para actualizar." });
        }

        // 🔹 Eliminamos la última coma y agregamos la condición WHERE
        updateQuery = updateQuery.slice(0, -2) + ` WHERE id = $${counter} RETURNING *;`;
        values.push(educationId);

        // 🔄 Ejecutar la actualización en la base de datos
        const updatedEducation = await pool.query(updateQuery, values);

        res.json({ 
            message: `✅ Educación con ID ${educationId} actualizada en el idioma ${lang}`, 
            updatedEducation: updatedEducation.rows[0]
        });
    } catch (error) {
        console.error("❌ Error al actualizar la educación:", error);
        res.status(500).json({ error: "❌ Error interno del servidor." });
    }
});
// Endpoint para agregar un nuevo proyecto con soporte multilingüe
app.post("/cv/projects", async (req, res) => {
    const { name_en, name_es, name_it, description_en, description_es, description_it, technologies, link } = req.body;

    // Validar que todos los campos multilingües y obligatorios estén completos
    if (!name_en || !name_es || !name_it || 
        !description_en || !description_es || !description_it || !technologies) {
        return res.status(400).json({ error: "❌ Todos los campos requeridos deben estar completos." });
    }

    try {
        // 🔹 Insertar en la base de datos con los tres idiomas
        const newProject = await pool.query(
            `INSERT INTO projects (name_en, name_es, name_it, description_en, description_es, description_it, technologies, link)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [name_en, name_es, name_it, description_en, description_es, description_it, technologies, link || null]
        );

        res.json({
            message: "✅ Nuevo proyecto agregado.",
            project: newProject.rows[0]
        });

    } catch (error) {
        console.error("❌ Error al agregar el proyecto:", error);
        res.status(500).json({ error: "❌ Error al agregar el proyecto en la base de datos." });
    }
});

// Endpoint para actualizar un proyecto en un idioma específico, incluyendo "technologies" y "link"
app.put("/cv/projects/:id/:lang", async (req, res) => {
    const { id, lang } = req.params;
    const { name, description, technologies, link } = req.body;

    // Verificar que el idioma sea válido
    if (!["en", "es", "it"].includes(lang)) {
        return res.status(400).json({ error: "❌ Idioma no válido. Debe ser 'en', 'es' o 'it'." });
    }

    try {
        // 🔹 Actualizar name y description en el idioma específico, además de technologies y link (que son únicos)
        const updatedProject = await pool.query(
            `UPDATE projects 
             SET name_${lang} = $1, 
                 description_${lang} = $2,
                 technologies = $3, 
                 link = $4
             WHERE id = $5
             RETURNING *`,
            [name, description, technologies, link, id]
        );

        if (updatedProject.rowCount === 0) {
            return res.status(404).json({ error: "❌ Proyecto no encontrado." });
        }

        res.json({
            message: `✅ Proyecto actualizado correctamente en ${lang}, incluyendo technologies y link.`,
            project: updatedProject.rows[0]
        });

    } catch (error) {
        console.error("❌ Error al actualizar el proyecto:", error);
        res.status(500).json({ error: "❌ Error al actualizar el proyecto en la base de datos." });
    }
});



// Endpoint para eliminar un proyecto existente
app.delete("/cv/projects/:id", async (req, res) => {
    const { id } = req.params;

    try {
        // 🔹 Eliminar el proyecto de la base de datos
        const deletedProject = await pool.query(
            "DELETE FROM projects WHERE id = $1 RETURNING *",
            [id]
        );

        if (deletedProject.rowCount === 0) {
            return res.status(404).json({ error: "❌ Proyecto no encontrado." });
        }

        res.json({ message: "✅ Proyecto eliminado correctamente." });

    } catch (error) {
        console.error("❌ Error al eliminar el proyecto:", error);
        res.status(500).json({ error: "❌ Error al eliminar el proyecto en la base de datos." });
    }
});

// Endpoint para agregar una Skill 
app.post("/cv/skills", async (req, res) => {
    const { category_en, category_es, category_it, skills } = req.body;
  
    if (!category_en || !category_es || !category_it || !skills) {
      return res.status(400).json({ error: "❌ Todos los campos son obligatorios." });
    }
  
    try {
      const newSkill = await pool.query(
        "INSERT INTO skills (category_en, category_es, category_it, skills) VALUES ($1, $2, $3, $4) RETURNING *",
        [category_en, category_es, category_it, skills]
      );
  
      res.json({ message: "✅ Habilidad agregada con éxito.", skill: newSkill.rows[0] });
    } catch (error) {
      console.error("❌ Error al agregar habilidad:", error);
      res.status(500).json({ error: "❌ Error al agregar habilidad en la base de datos." });
    }
  });
  

// Endpoint para actualizar una Skill específica en un idioma
app.put("/cv/skills/:id/:lang", async (req, res) => {
    const skillId = parseInt(req.params.id, 10);
    const lang = req.params.lang.toLowerCase(); // 🔹 Convertimos a minúscula para evitar errores
    const updatedFields = req.body; // 🔹 Contiene solo los valores a actualizar

    if (!["en", "es", "it"].includes(lang)) {
        return res.status(400).json({ error: "❌ Idioma no válido. Debe ser 'en', 'es' o 'it'." });
    }

    try {
        // 🔍 Verificar si la habilidad con el ID existe
        const checkSkill = await pool.query("SELECT * FROM skills WHERE id = $1", [skillId]);
        if (checkSkill.rows.length === 0) {
            return res.status(404).json({ error: "❌ No se encontró la habilidad con el ID proporcionado." });
        }

        // 🔄 Construimos dinámicamente la consulta UPDATE solo con los campos válidos
        let updateQuery = "UPDATE skills SET ";
        const values = [];
        let counter = 1;

        for (const key in updatedFields) {
            if (key === "skills") {
                // 🔹 `skills` NO tiene variaciones por idioma
                updateQuery += `${key} = $${counter}, `;
            } else if (key === "category") {
                // 🔹 `category` tiene variaciones por idioma
                updateQuery += `${key}_${lang} = $${counter}, `;
            } else {
                return res.status(400).json({ error: `❌ El campo '${key}' no es válido para actualizar.` });
            }
            values.push(updatedFields[key]);
            counter++;
        }

        updateQuery = updateQuery.slice(0, -2) + ` WHERE id = $${counter} RETURNING *;`;
        values.push(skillId);

        const updatedSkill = await pool.query(updateQuery, values);

        res.json({ message: `✅ Habilidad con ID ${skillId} actualizada en ${lang}`, updatedSkill: updatedSkill.rows[0] });
    } catch (error) {
        console.error("❌ Error al actualizar la habilidad:", error);
        res.status(500).json({ error: "❌ Error interno del servidor." });
    }
});

// Endpoint para eliminar una Skill
app.delete("/cv/skills/:id", async (req, res) => {
    const skillId = parseInt(req.params.id, 10);
  
    try {
      await pool.query("DELETE FROM skills WHERE id = $1", [skillId]);
      res.json({ message: `✅ Habilidad con ID ${skillId} eliminada.` });
    } catch (error) {
      console.error("❌ Error al eliminar habilidad:", error);
      res.status(500).json({ error: "❌ No se pudo eliminar la habilidad." });
    }
  });
  
// Endpoint para actualizar un idioma específico en un idioma
app.put("/cv/languages/:id/:lang", async (req, res) => {
    const languageId = parseInt(req.params.id, 10);
    const lang = req.params.lang.toLowerCase(); // 🔹 Convertimos a minúscula para evitar errores
    const updatedFields = req.body; // 🔹 Contiene solo los valores a actualizar

    if (!["en", "es", "it"].includes(lang)) {
        return res.status(400).json({ error: "❌ Idioma no válido. Debe ser 'en', 'es' o 'it'." });
    }

    try {
        const checkLanguage = await pool.query("SELECT * FROM languages WHERE id = $1", [languageId]);
        if (checkLanguage.rows.length === 0) {
            return res.status(404).json({ error: "❌ No se encontró el idioma con el ID proporcionado." });
        }

        let updateQuery = "UPDATE languages SET ";
        const values = [];
        let counter = 1;

        for (const key in updatedFields) {
            if (["language", "level"].includes(key)) {
                // 🔹 `language` y `level` tienen versiones en idioma
                updateQuery += `${key}_${lang} = $${counter}, `;
            } else {
                return res.status(400).json({ error: `❌ El campo '${key}' no es válido para actualizar.` });
            }
            values.push(updatedFields[key]);
            counter++;
        }

        updateQuery = updateQuery.slice(0, -2) + ` WHERE id = $${counter} RETURNING *;`;
        values.push(languageId);

        const updatedLanguage = await pool.query(updateQuery, values);

        res.json({ 
            message: `✅ Idioma con ID ${languageId} actualizado en ${lang}`, 
            updatedLanguage: updatedLanguage.rows[0] 
        });
    } catch (error) {
        console.error("❌ Error al actualizar el idioma:", error);
        res.status(500).json({ error: "❌ Error interno del servidor." });
    }
});

// Endpoint para actualizar los datos de contacto en un idioma específico
app.put("/cv/contact/:lang", async (req, res) => {
    const lang = req.params.lang.toLowerCase(); // 📌 Convertimos a minúscula para evitar errores
    const updatedFields = req.body; // 📌 Contiene solo los valores a actualizar

    if (!["en", "es", "it"].includes(lang)) {
        return res.status(400).json({ error: "❌ Idioma no válido. Debe ser 'en', 'es' o 'it'." });
    }

    try {
        // 🔄 Actualizar cada campo individualmente
        const fieldsToUpdate = ["email", "phone", "address"];
        const values = [];

        for (const key of fieldsToUpdate) {
            if (updatedFields[key]) {
                await pool.query(`UPDATE dictionary SET ${lang} = $1 WHERE key = $2`, [updatedFields[key], key]);
                values.push({ key, value: updatedFields[key] });
            }
        }

        // 🔹 Consultar los datos actualizados
        const updatedContact = await pool.query("SELECT key, en, es, it FROM dictionary WHERE key IN ('email', 'phone', 'address')");

        res.json({ 
            message: `✅ Datos de contacto actualizados en el idioma ${lang}`, 
            updatedContact: updatedContact.rows
        });
    } catch (error) {
        console.error("❌ Error al actualizar los datos de contacto:", error);
        res.status(500).json({ error: "❌ Error interno del servidor." });
    }
});

// Endpoint para actualizar el perfil en un idioma específico
app.put("/cv/profile/:lang", async (req, res) => {
    const lang = req.params.lang; // 📌 Obtener el idioma de la URL
    const updatedFields = req.body; // 📌 Contiene solo los valores a actualizar

    if (!["en", "es", "it"].includes(lang)) {
        return res.status(400).json({ error: "❌ Idioma no válido. Debe ser 'en', 'es' o 'it'." });
    }

    try {
        // 🔍 Verificar si `profile_description` existe en la base de datos
        const checkProfile = await pool.query("SELECT * FROM dictionary WHERE key = 'profile_description'");
        if (checkProfile.rows.length === 0) {
            return res.status(404).json({ error: "❌ No se encontró la descripción del perfil en la base de datos." });
        }

        // 🔄 Actualizar la descripción del perfil en el idioma especificado
        await pool.query(
            `UPDATE dictionary SET ${lang} = $1 WHERE key = 'profile_description' RETURNING *;`,
            [updatedFields.profile_description]
        );

        // 🔹 Obtener el perfil actualizado
        const updatedProfile = await pool.query("SELECT key, en, es, it FROM dictionary WHERE key = 'profile_description'");

        res.json({
            message: `✅ Perfil actualizado en el idioma ${lang}`,
            updatedProfile: updatedProfile.rows[0]
        });
    } catch (error) {
        console.error("❌ Error al actualizar el perfil:", error);
        res.status(500).json({ error: "❌ Error al actualizar el perfil en la base de datos." });
    }
});


// 📌 Endpoint para obtener los ingresos y gastos de un mes/año específico
app.get("/finance/:month/:year", async (req, res) => {
    const { month, year } = req.params;
    const monthYearKey = `${year}-${month.padStart(2, '0')}`; // 🔹 Asegura formato correcto YYYY-MM

    try {
        const incomeQuery = await pool.query("SELECT * FROM income WHERE month_year = $1", [monthYearKey]);
        const expensesQuery = await pool.query("SELECT * FROM expenses WHERE month_year = $1", [monthYearKey]);

        res.json({
            income: incomeQuery.rows[0] || { amount: 0, currency: "EUR" },
            expenses: expensesQuery.rows || []
        });

    } catch (error) {
        console.error("❌ Error al obtener los datos financieros:", error);
        res.status(500).json({ error: "Error al obtener datos financieros." });
    }
});

// 📝 Endpoint para actualizar la entrada mensual
app.put("/finance/:month/:year/income", async (req, res) => {
    const { month, year } = req.params;
    const { amount, currency } = req.body;
    const monthYearKey = `${year}-${month.padStart(2, "0")}`; // 🔹 Asegura formato YYYY-MM

    try {
        // 🔍 Verificar si ya existe un ingreso para el mes/año especificado
        const checkIncome = await pool.query("SELECT * FROM income WHERE month_year = $1", [monthYearKey]);

        if (checkIncome.rows.length > 0) {
            // 🔄 Si ya existe, actualizamos el ingreso
            await pool.query(
                "UPDATE income SET amount = $1, currency = $2 WHERE month_year = $3 RETURNING *",
                [amount, currency, monthYearKey]
            );
            console.log(`✅ Entrada mensual actualizada para ${monthYearKey}`);
        } else {
            // ➕ Si no existe, insertamos un nuevo registro
            await pool.query(
                "INSERT INTO income (month_year, amount, currency) VALUES ($1, $2, $3) RETURNING *",
                [monthYearKey, amount, currency]
            );
            console.log(`📌 Nueva entrada mensual creada para ${monthYearKey}`);
        }

        // 🔹 Obtener el ingreso actualizado o recién creado
        const updatedIncome = await pool.query("SELECT * FROM income WHERE month_year = $1", [monthYearKey]);

        res.json({
            message: `✅ Entrada mensual actualizada para ${monthYearKey}`,
            income: updatedIncome.rows[0]
        });
    } catch (error) {
        console.error("❌ Error al actualizar la entrada mensual:", error);
        res.status(500).json({ error: "❌ Error al actualizar la entrada mensual en la base de datos." });
    }
});



// 🗑️ Endpoint para eliminar la entrada mensual
app.delete("/finance/:month/:year/income", async (req, res) => {
    const { month, year } = req.params;
    const monthYearKey = `${year}-${month.toLowerCase()}`; // 🔹 Formato estándar YYYY-MM

    try {
        // 🔍 Verificar si la entrada mensual existe en la base de datos
        const checkIncome = await pool.query("SELECT * FROM income WHERE month_year = $1", [monthYearKey]);

        if (checkIncome.rows.length === 0) {
            return res.status(404).json({ message: "❌ No hay datos de ingreso para este mes y año." });
        }

        // 🔄 Eliminar la entrada de la base de datos
        await pool.query("DELETE FROM income WHERE month_year = $1", [monthYearKey]);

        res.json({ message: "✅ Entrada mensual eliminada correctamente." });
    } catch (error) {
        console.error("❌ Error al eliminar la entrada mensual:", error);
        res.status(500).json({ error: "❌ Error al eliminar la entrada mensual en la base de datos." });
    }
});



  // Endpoint para obtener los datos de gastos por mes y año
  app.get("/finance/:month/:year", async (req, res) => {
    const { month, year } = req.params;
    const monthYearKey = `${year}-${month.toLowerCase()}`; // 🔹 Formato estándar YYYY-MM

    try {
        console.log(`🔍 Buscando datos financieros para: ${monthYearKey}`);

        // 🔹 Obtener el ingreso del mes/año especificado
        const incomeResult = await pool.query("SELECT * FROM income WHERE month_year = $1", [monthYearKey]);
        const income = incomeResult.rows.length > 0 ? incomeResult.rows[0] : { amount: 0, currency: "EUR" };

        // 🔹 Obtener los gastos del mes/año especificado
        const expensesResult = await pool.query("SELECT * FROM expenses WHERE month_year = $1", [monthYearKey]);
        const expenses = expensesResult.rows.map(exp => ({
            id: exp.id,
            name: exp.name,
            category: exp.category,
            amount: exp.amount,
            currency: exp.currency || "EUR", // Si el gasto no tiene moneda, se asume EUR
            status: exp.status,
            date_added: exp.date_added
        }));

        const response = { income, expenses };

        console.log(`✅ Datos encontrados para ${monthYearKey}:`, response);
        res.json(response);
    } catch (error) {
        console.error("❌ Error al obtener los datos financieros:", error);
        res.status(500).json({ message: "❌ Error en el servidor al obtener datos financieros." });
    }
});


  

// 📌 Endpoint para agregar un nuevo gasto al mes/año especificado
app.post("/finance/:month/:year/expenses", async (req, res) => {
    const { month, year } = req.params;
    const { name, category, amount, currency, status } = req.body;
    const monthYearKey = `${year}-${month.toLowerCase()}`; // 🔹 Formato estándar YYYY-MM

    // 🔹 Verificar que se proporcionaron todos los datos necesarios
    if (!name || !category || !amount || !currency) {
        return res.status(400).json({ error: "❌ Faltan datos obligatorios para agregar el gasto." });
    }

    try {
        // 🔄 Insertar el nuevo gasto en la base de datos
        const newExpense = await pool.query(
            `INSERT INTO expenses (month_year, name, category, amount, currency, status, date_added) 
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE) 
            RETURNING *`,
            [monthYearKey, name, category, parseFloat(amount), currency, status || "pending"]
        );

        console.log(`✅ Nuevo gasto agregado a ${monthYearKey}:`, newExpense.rows[0]);

        res.json({
            message: `✅ Gasto agregado correctamente a ${monthYearKey}`,
            newExpense: newExpense.rows[0]
        });
    } catch (error) {
        console.error("❌ Error al agregar el gasto:", error);
        res.status(500).json({ error: "❌ Error al guardar el gasto en la base de datos." });
    }
});


// ✅ Endpoint para actualizar un gasto existente
app.put("/finance/:month/:year/expenses/:id", async (req, res) => {
    const { month, year, id } = req.params;
    const { name, category, amount, currency, status } = req.body;
    const monthYearKey = `${year}-${month.toLowerCase()}`; // 🔹 Formato estándar YYYY-MM

    try {
        // 🔍 Verificar si el gasto con el ID existe
        const checkExpense = await pool.query("SELECT * FROM expenses WHERE id = $1 AND month_year = $2", [id, monthYearKey]);

        if (checkExpense.rows.length === 0) {
            return res.status(404).json({ error: `❌ No se encontró el gasto con ID ${id} para ${month} ${year}.` });
        }

        // 🔄 Construimos dinámicamente la consulta UPDATE solo con los campos a modificar
        let updateQuery = "UPDATE expenses SET ";
        const values = [];
        let counter = 1;

        if (name) {
            updateQuery += `name = $${counter}, `;
            values.push(name);
            counter++;
        }
        if (category) {
            updateQuery += `category = $${counter}, `;
            values.push(category);
            counter++;
        }
        if (amount) {
            updateQuery += `amount = $${counter}, `;
            values.push(parseFloat(amount));
            counter++;
        }
        if (currency) {
            updateQuery += `currency = $${counter}, `;
            values.push(currency);
            counter++;
        }
        if (status) {
            updateQuery += `status = $${counter}, `;
            values.push(status);
            counter++;
        }

        // 🔹 Eliminamos la última coma y agregamos la condición WHERE
        updateQuery = updateQuery.slice(0, -2) + ` WHERE id = $${counter} AND month_year = $${counter + 1} RETURNING *;`;
        values.push(id, monthYearKey);

        // 🔄 Ejecutar la actualización en la base de datos
        const updatedExpense = await pool.query(updateQuery, values);

        res.json({
            message: "✅ Gasto actualizado correctamente",
            updatedExpense: updatedExpense.rows[0]
        });
    } catch (error) {
        console.error("❌ Error al actualizar el gasto:", error);
        res.status(500).json({ error: "❌ Error al actualizar el gasto en la base de datos." });
    }
});



// Endpoint para actualizar el estado de un gasto (ej. marcar como liquidado o pendiente)
app.put("/finance/expenses/:month/:year/:id", async (req, res) => {
    const { month, year, id } = req.params;
    const updatedFields = req.body;
    const expenseId = parseInt(id, 10);
    const monthYearKey = `${year}-${month.toLowerCase()}`; // 🔹 Formato estándar YYYY-MM

    try {
        // 🔍 Verificar si el gasto con el ID especificado existe en la base de datos
        const checkExpense = await pool.query("SELECT * FROM expenses WHERE id = $1 AND month_year = $2", [expenseId, monthYearKey]);

        if (checkExpense.rows.length === 0) {
            return res.status(404).json({ error: `❌ No se encontró el gasto con ID ${expenseId} para ${month} ${year}.` });
        }

        // 🔄 Construimos dinámicamente la consulta UPDATE solo con los campos a modificar
        let updateQuery = "UPDATE expenses SET ";
        const values = [];
        let counter = 1;

        for (const key in updatedFields) {
            updateQuery += `${key} = $${counter}, `;
            values.push(updatedFields[key]);
            counter++;
        }

        // 🔹 Eliminamos la última coma y agregamos la condición WHERE
        updateQuery = updateQuery.slice(0, -2) + ` WHERE id = $${counter} AND month_year = $${counter + 1} RETURNING *;`;
        values.push(expenseId, monthYearKey);

        // 🔄 Ejecutar la actualización en la base de datos
        const updatedExpense = await pool.query(updateQuery, values);

        res.json({
            message: `✅ Gasto con ID ${expenseId} actualizado correctamente`,
            updatedExpense: updatedExpense.rows[0]
        });
    } catch (error) {
        console.error("❌ Error al actualizar el gasto:", error);
        res.status(500).json({ error: "❌ Error al actualizar el gasto en la base de datos." });
    }
});



// Endpoint para eliminar un gasto de un mes y año específicos
app.delete("/finance/:month/:year/expenses/:id", async (req, res) => {
    const { month, year, id } = req.params;
    const expenseId = parseInt(id, 10); // 🔹 Convertimos ID a número
    const monthYearKey = `${year}-${month.toLowerCase()}`; // 🔹 Formato estándar YYYY-MM

    try {
        // 🔍 Verificar si el gasto con el ID especificado existe en la base de datos
        const checkExpense = await pool.query("SELECT * FROM expenses WHERE id = $1 AND month_year = $2", [expenseId, monthYearKey]);

        if (checkExpense.rows.length === 0) {
            return res.status(404).json({ error: `❌ No se encontró el gasto con ID ${expenseId} para ${month} ${year}.` });
        }

        // 🔄 Eliminar el gasto de la base de datos
        await pool.query("DELETE FROM expenses WHERE id = $1 AND month_year = $2", [expenseId, monthYearKey]);

        res.json({ message: `✅ Gasto con ID ${expenseId} eliminado correctamente.` });
    } catch (error) {
        console.error("❌ Error al eliminar el gasto:", error);
        res.status(500).json({ error: "❌ Error al eliminar el gasto en la base de datos." });
    }
});


/// 🔹 Endpoint para pasar gastos a un nuevo mes (con migración automática)
app.post("/finance/:month/:year/migrate-expenses", async (req, res) => {
    const { month, year } = req.params;

    try {
        // 📌 Convertir el mes a número (para que coincida con la base de datos)
        const monthMapping = {
            // 🔹 Español
            enero: "01", febrero: "02",  abril: "04",
            mayo: "05", junio: "06", julio: "07", 
            septiembre: "09", octubre: "10", noviembre: "11", 

            // 🔹 Italiano
            gennaio: "01", febbraio: "02", marzo: "03", aprile: "04",
            maggio: "05", giugno: "06", luglio: "07", agosto: "08",
            settembre: "09", ottobre: "10", novembre: "11", dicembre: "12",

            // 🔹 Inglés
            january: "01", february: "02", march: "03", april: "04",
            may: "05", june: "06", july: "07", august: "08",
            september: "09", october: "10", november: "11", december: "12"
        };

        const currentMonthNum = monthMapping[month.toLowerCase()];
        if (!currentMonthNum) {
            return res.status(400).json({ error: "❌ Mes inválido en la solicitud." });
        }

        // 📌 Obtener el mes anterior en formato correcto (YYYY-MM)
        let prevYear = parseInt(year);
        let prevMonthNum = parseInt(currentMonthNum) - 1;

        if (prevMonthNum === 0) {
            prevMonthNum = 12;
            prevYear -= 1; // 🔹 Si el mes anterior es enero, retrocede un año
        }

        const prevMonthStr = prevMonthNum.toString().padStart(2, "0"); // 🔹 Convertir a "02", "03", etc.
        const prevMonthYearKey = `${prevYear}-${prevMonthStr}`;
        const currentMonthYearKey = `${year}-${currentMonthNum}`;

        console.log(`🔍 Buscando gastos pendientes en ${prevMonthYearKey} para migrar a ${currentMonthYearKey}`);

        // 🔹 Obtener gastos pendientes del mes anterior
        const pendingExpenses = await pool.query(
            "SELECT * FROM expenses WHERE month_year = $1 AND LOWER(status) = 'pending'",
            [prevMonthYearKey]
        );

        if (pendingExpenses.rows.length === 0) {
            console.log(`📌 No hay gastos pendientes para trasladar desde ${prevMonthYearKey}.`);
            return res.status(200).json({ message: "✅ No hay gastos pendientes para trasladar." });
        }

        // 🔹 Migrar los gastos al nuevo mes
        for (const expense of pendingExpenses.rows) {
            await pool.query(
                `UPDATE expenses
                 SET month_year = $1
                 WHERE month_year = $2 AND LOWER(status) = 'pending'`,
                [currentMonthYearKey, prevMonthYearKey]
              );
        }

        console.log(`✅ Gastos migrados de ${prevMonthYearKey} a ${currentMonthYearKey}.`);

        res.json({ message: `✅ Gastos pendientes trasladados de ${prevMonthYearKey} a ${currentMonthYearKey}.` });
    } catch (error) {
        console.error("❌ Error al migrar los gastos:", error);
        res.status(500).json({ error: "❌ Error al trasladar los gastos en la base de datos." });
    }
});

// Obtener todos los gastos recurrentes
app.get("/api/recurring-expenses", async (req, res) => {
    try {
      const { data, error } = await supabase.from("recurring_expenses").select("*").order("id", { ascending: true });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Crear un nuevo gasto recurrente
  app.post("/api/recurring-expenses", async (req, res) => {
    try {
      const { title, amount, category, currency, due_day, active } = req.body;
      const { data, error } = await supabase.from("recurring_expenses").insert([
        { title, amount, category, currency, due_day, active }
      ]);
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// Actualizar un gasto recurrente
app.put("/api/recurring-expenses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { title, amount, category, currency, due_day, active } = req.body;
  
      const { data, error } = await supabase
        .from("recurring_expenses")
        .update({ title, amount, category, currency, due_day, active })
        .eq("id", id);
  
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Eliminar un gasto recurrente
  app.delete("/api/recurring-expenses/:id", async (req, res) => {
    try {
      const { id } = req.params;
  
      const { data, error } = await supabase
        .from("recurring_expenses")
        .delete()
        .eq("id", id);
  
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

 /// 🔹 Endpoint para pasar gastos recurrentes a un nuevo mes (con migración automática) 
app.post("/finance/migrate-recurring-expenses", async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const monthYearKey = `${year}-${month}`;
    const today = now.toISOString().split("T")[0];

    console.log(`🔄 Verificando recurrentes para el mes: ${monthYearKey}`);

    const { data: recurring, error } = await supabase
      .from("recurring_expenses")
      .select("*")
      .eq("active", true);

    if (error) {
      console.error("❌ Error en Supabase:", error);
      throw error;
    }

    console.log("📦 Recurrentes recibidos:", recurring);

    let inserted = 0;

    for (const item of recurring) {
      if (!item.title || !item.amount || !item.category || !item.currency) {
        console.log("⚠️ Gasto recurrente con datos incompletos:", item);
        continue;
      }

      const existing = await pool.query(
        `SELECT * FROM expenses WHERE name = $1 AND month_year = $2`,
        [item.title, monthYearKey]
      );

      if (existing.rows.length === 0) {
        await pool.query(
            `INSERT INTO expenses 
             (name, amount, category, currency, date_added, status, month_year) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              item.title,
              item.amount,
              item.category,
              item.currency,
              today,
              "pending",
              monthYearKey,
            ]
          );
          
        inserted++;
        console.log(`✅ Insertado: ${item.title}`);
      } else {
        console.log(`⏭️ Ya existe: ${item.title}`);
      }
    }

    res.json({ message: "🧾 Migración completa", inserted });
  } catch (err) {
    console.error("❌ Error al migrar gastos recurrentes:", err.message);
    res.status(500).json({ error: "❌ Error interno al migrar gastos recurrentes." });
  }
});

  
// Ruta para probar la conexión con PostgreSQL
app.get("/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()"); // Ejecuta una consulta simple
        res.json({ message: "✅ Conexión exitosa", time: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: "❌ Error en la conexión", details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});


