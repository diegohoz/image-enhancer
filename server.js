import express from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const app = express();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE_MB = 15;
const TEMP_DIR = "/app/temp";
const TEMP_TTL_MS = 10 * 60 * 1000; // 10 minutos

const FORMATS = {
  feed: {
    width: 1080,
    height: 1080,
    fit: "inside",
    label: "Feed Instagram / Facebook",
  },
  story: {
    width: 1080,
    height: 1920,
    fit: "inside",
    label: "Story / Reels Instagram",
  },
  pinterest: {
    width: 1000,
    height: 1500,
    fit: "inside",
    label: "Pinterest",
  },
  linkedin: {
    width: 1200,
    height: 627,
    fit: "cover",
    label: "LinkedIn",
  },
  twitter: {
    width: 1200,
    height: 675,
    fit: "cover",
    label: "Twitter / X",
  },
};

const DEFAULT_FORMAT = "feed";

// Crear carpeta temp si no existe
if (!existsSync(TEMP_DIR)) {
  await mkdir(TEMP_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

// Limpiar archivos temporales caducados cada 5 minutos
setInterval(async () => {
  try {
    const { readdir, stat } = await import("fs/promises");
    const files = await readdir(TEMP_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const { mtimeMs } = await stat(filePath);
      if (now - mtimeMs > TEMP_TTL_MS) {
        await unlink(filePath);
        console.log(`Temp file deleted: ${file}`);
      }
    }
  } catch (err) {
    console.error("Error cleaning temp files:", err);
  }
}, 5 * 60 * 1000);

app.get("/", (req, res) => {
  res.json({
    status: "Image enhancer API funcionando",
    formatos_disponibles: Object.entries(FORMATS).map(([key, val]) => ({
      format: key,
      descripcion: val.label,
      resolucion: `${val.width}x${val.height}`,
    })),
    endpoints: {
      enhance: "POST /enhance?format=feed|story|pinterest|linkedin|twitter → devuelve binario",
      enhance_url: "POST /enhance-url?format=feed|story|pinterest|linkedin|twitter → devuelve URL pública (para Instagram)",
      delete: "DELETE /temp/:filename → elimina archivo temporal",
    },
  });
});

// Procesar imagen y devolver el procesado Sharp
const processImage = async (buffer, formatKey) => {
  const format = FORMATS[formatKey] || FORMATS[DEFAULT_FORMAT];
  return sharp(buffer)
    .rotate()
    .resize({
      width: format.width,
      height: format.height,
      fit: format.fit,
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .sharpen({ sigma: 0.8 })
    .jpeg({
      quality: 88,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
};

// Endpoint original — devuelve binario (para Facebook y n8n)
app.post("/enhance", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No image uploaded");
    if (!ALLOWED_TYPES.includes(req.file.mimetype))
      return res.status(400).send("Formato no soportado. Usa JPEG, PNG, WEBP o HEIC");

    const formatKey = req.query.format || DEFAULT_FORMAT;
    if (!FORMATS[formatKey]) {
      return res.status(400).json({
        error: `Formato '${formatKey}' no válido.`,
        formatos_validos: Object.keys(FORMATS),
      });
    }

    const output = await processImage(req.file.buffer, formatKey);

    res.set("Content-Type", "image/jpeg");
    res.set("X-Format-Used", formatKey);
    res.set("X-Resolution", `${FORMATS[formatKey].width}x${FORMATS[formatKey].height}`);
    res.send(output);

  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing image");
  }
});

// Endpoint nuevo — procesa y guarda temporalmente, devuelve URL pública (para Instagram)
app.post("/enhance-url", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No image uploaded");
    if (!ALLOWED_TYPES.includes(req.file.mimetype))
      return res.status(400).send("Formato no soportado. Usa JPEG, PNG, WEBP o HEIC");

    const formatKey = req.query.format || DEFAULT_FORMAT;
    if (!FORMATS[formatKey]) {
      return res.status(400).json({
        error: `Formato '${formatKey}' no válido.`,
        formatos_validos: Object.keys(FORMATS),
      });
    }

    const output = await processImage(req.file.buffer, formatKey);

    // Guardar con nombre único
    const filename = `${randomUUID()}.jpg`;
    const filePath = path.join(TEMP_DIR, filename);
    await writeFile(filePath, output);

    // Construir URL pública
    const baseUrl = process.env.BASE_URL || `https://${req.hostname}`;
    const imageUrl = `${baseUrl}/temp/${filename}`;

    res.json({
      url: imageUrl,
      filename,
      format: formatKey,
      resolution: `${FORMATS[formatKey].width}x${FORMATS[formatKey].height}`,
      expires_in: "10 minutos",
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing image");
  }
});

// Servir archivos temporales públicamente
app.use("/temp", express.static(TEMP_DIR));

// Endpoint para borrar manualmente un archivo temporal (opcional, desde n8n tras publicar)
app.delete("/temp/:filename", async (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // evita path traversal
    const filePath = path.join(TEMP_DIR, filename);
    await unlink(filePath);
    res.json({ deleted: filename });
  } catch (error) {
    res.status(404).json({ error: "Archivo no encontrado" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Image enhancer running on port ${process.env.PORT || 3000}`);
  console.log(`Formatos disponibles: ${Object.keys(FORMATS).join(", ")}`);
  console.log(`Temp dir: ${TEMP_DIR}`);
});