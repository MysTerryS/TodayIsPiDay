const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Нужно для Render
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    pool.query("SELECT username, password, role FROM users WHERE username = $1", [username])
        .then(result => {
            if (result.rows.length === 0) {
                return res.json({ success: false, message: "Неверный логин или пароль" });
            }

            const user = result.rows[0];
            if (user.password !== password) {
                return res.json({ success: false, message: "Неверный логин или пароль" });
            }

            res.json({ success: true, role: user.role });
        })
        .catch(error => {
            console.error("Ошибка при входе:", error);
            res.status(500).json({ success: false, message: "Ошибка сервера" });
        });
});

app.get("/user/:username", (req, res) => {
    const { username } = req.params;

    pool.query("SELECT * FROM users WHERE username = $1", [username])
        .then(result => {
            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Пользователь не найден" });
            }

            const user = result.rows[0];

            if (user.status === true) {
                return res.json({ success: false, message: "Вы уже сдали тест. Повторное прохождение невозможно." });
            }

            if (user.counts <= 0) {
                return res.json({ success: false, message: "У вас закончились попытки. Тест недоступен." });
            }

            res.json({ success: true, counts: user.counts });
        })
        .catch(err => {
            console.error("Ошибка при запросе пользователя:", err);
            res.status(500).json({ error: "Ошибка сервера" });
        });
});

app.post("/submit-test", (req, res) => {
    const { username, score } = req.body;
    const passingScore = 45; // Минимальный балл для успешной сдачи (например, 75%)

    // Получаем данные пользователя
    pool.query("SELECT * FROM users WHERE username = $1", [username])
        .then(result => {
            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Пользователь не найден" });
            }

            const user = result.rows[0];

            if (user.status === true) {
                return res.json({ success: false, message: "Вы уже сдали тест." });
            }

            if (user.counts <= 0) {
                return res.json({ success: false, message: "У вас закончились попытки." });
            }

            let newStatus = score >= passingScore ? true : false;
            let newAttempts = user.counts - 1;

            // Обновляем данные в БД
            return pool.query("UPDATE users SET counts = $1, status = $2 WHERE username = $3",
                [newAttempts, newStatus, username])
                .then(() => {
                    res.json({ success: true, status: newStatus, counts: newAttempts });
                });
        })
        .catch(err => {
            console.error("Ошибка при обновлении данных:", err);
            res.status(500).json({ error: "Ошибка сервера" });
        });
});

app.get("/employees", (req, res) => {
    pool.query("SELECT username, counts, status FROM users")
        .then(result => res.json(result.rows))
        .catch(error => res.status(500).json({ error: "Ошибка сервера" }));
});

app.post("/add-employee", (req, res) => {
    const { username, password, attempts } = req.body;
    pool.query("INSERT INTO users (username, password, counts, status) VALUES ($1, $2, $3, false)", [username, password, attempts])
        .then(() => res.json({ success: true }))
        .catch(error => res.status(500).json({ error: "Ошибка сервера" }));
});

app.put("/update-attempts/:username", (req, res) => {
    const { username } = req.params;
    pool.query("UPDATE users SET counts = counts + 1 WHERE username = $1", [username])
        .then(() => res.json({ success: true }))
        .catch(error => res.status(500).json({ error: "Ошибка сервера" }));
});

app.delete("/delete-employee/:username", (req, res) => {
    const { username } = req.params;
    pool.query("DELETE FROM users WHERE username = $1", [username])
        .then(() => res.json({ success: true }))
        .catch(error => res.status(500).json({ error: "Ошибка сервера" }));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
