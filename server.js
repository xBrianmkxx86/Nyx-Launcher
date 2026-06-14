const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const Datastore = require("@seald-io/nedb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "nyx_super_secret_key_change_this";

// ── Directorios ───────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
const SKINS_DIR = path.join(__dirname, "data", "skins");
fs.mkdirSync(SKINS_DIR, { recursive: true });

// ── Base de datos ─────────────────────────────────────────────────────────────
const db = {
  users: new Datastore({ filename: path.join(DATA_DIR, "users.db"), autoload: true }),
  news:  new Datastore({ filename: path.join(DATA_DIR, "news.db"),  autoload: true }),
};

// Índice único en username
db.users.ensureIndex({ fieldName: "username", unique: true });

// Noticias por defecto si la BD está vacía
db.news.count({}, (err, count) => {
  if (!err && count === 0) {
    db.news.insert([
      { text: "¡Bienvenido a Nyx Launcher!", order: 0 },
      { text: "Soporte para Forge y Fabric", order: 1 },
      { text: "Visor 3D de skin integrado — v5.1", order: 2 },
      { text: "Sistema de skins compatible sin mods", order: 3 },
    ]);
  }
});

// ── Multer (upload de skins) ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SKINS_DIR),
  filename: (req, file, cb) => {
    // Nombre: <username>.png — el username viene del token
    cb(null, `${req.user.username}.png`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB máximo
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png") cb(null, true);
    else cb(new Error("Solo se aceptan archivos PNG"));
  },
});

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/skins", express.static(SKINS_DIR)); // Servir skins públicamente

// ── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Sin token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido o expirado" });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═════════════════════════════════════════════════════════════════════════════
app.get("/health", (req, res) => {
  res.json({ ok: true, server: "Nyx Launcher Server", version: "1.0.0" });
});

// ═════════════════════════════════════════════════════════════════════════════
// REGISTER
// POST /register  { username, password }
// ═════════════════════════════════════════════════════════════════════════════
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || username.length < 3 || username.length > 16)
      return res.json({ ok: false, error: "Usuario debe tener 3-16 caracteres" });

    if (!password || password.length < 4)
      return res.json({ ok: false, error: "Contraseña mínimo 4 caracteres" });

    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.json({ ok: false, error: "Solo letras, números y guión bajo" });

    const hash = await bcrypt.hash(password, 10);

    db.users.insert(
      { username, passwordHash: hash, accountType: "Cracked", skinPath: "", skinModel: "classic", createdAt: new Date() },
      (err) => {
        if (err) {
          if (err.errorType === "uniqueViolated")
            return res.json({ ok: false, error: "El usuario ya existe" });
          return res.json({ ok: false, error: "Error interno" });
        }
        res.json({ ok: true, message: `Cuenta '${username}' creada exitosamente` });
      }
    );
  } catch (ex) {
    res.json({ ok: false, error: ex.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// LOGIN
// POST /login  { username, password }
// ═════════════════════════════════════════════════════════════════════════════
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.json({ ok: false, error: "Usuario y contraseña requeridos" });

  db.users.findOne({ username }, async (err, user) => {
    if (err || !user)
      return res.json({ ok: false, error: "Usuario no encontrado" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.json({ ok: false, error: "Contraseña incorrecta" });

    const token = jwt.sign(
      { username: user.username, accountType: user.accountType },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || "30d" }
    );

    // URL de skin si tiene
    const skinUrl = user.skinPath
      ? `${req.protocol}://${req.get("host")}/skins/${username}.png`
      : "";

    res.json({
      ok: true,
      token,
      username: user.username,
      accountType: user.accountType,
      skinPath: skinUrl,
      skinModel: user.skinModel || "classic",
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SKIN — UPLOAD
// POST /skin/upload  (multipart, campo "file" + campo "variant")
// ═════════════════════════════════════════════════════════════════════════════
app.post("/skin/upload", authMiddleware, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.json({ ok: false, error: err.message });
    if (!req.file) return res.json({ ok: false, error: "No se recibió archivo" });

    const model = req.body.variant === "slim" ? "slim" : "classic";
    const skinUrl = `${req.protocol}://${req.get("host")}/skins/${req.user.username}.png`;

    db.users.update(
      { username: req.user.username },
      { $set: { skinPath: skinUrl, skinModel: model } },
      {},
      (err2) => {
        if (err2) return res.json({ ok: false, error: "Error al guardar skin" });
        res.json({ ok: true, skinUrl, skinModel: model });
      }
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SKIN — GET URL
// GET /skin/:username
// ═════════════════════════════════════════════════════════════════════════════
app.get("/skin/:username", (req, res) => {
  const { username } = req.params;
  db.users.findOne({ username }, (err, user) => {
    if (err || !user) return res.json({ ok: false, error: "Usuario no encontrado" });

    const skinFile = path.join(SKINS_DIR, `${username}.png`);
    const hasSkin = fs.existsSync(skinFile);

    res.json({
      ok: true,
      skinUrl: hasSkin
        ? `${req.protocol}://${req.get("host")}/skins/${username}.png`
        : "",
      skinModel: user.skinModel || "classic",
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTICIAS
// GET /news
// ═════════════════════════════════════════════════════════════════════════════
app.get("/news", (req, res) => {
  db.news.find({}).sort({ order: 1 }).exec((err, docs) => {
    if (err) return res.json({ ok: false, news: [] });
    res.json({ ok: true, news: docs.map((d) => ({ text: d.text })) });
  });
});

// ── Inicio ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Nyx Server corriendo en puerto ${PORT}`);
});
