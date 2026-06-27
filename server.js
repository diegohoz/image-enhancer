import express from "express";
import multer from "multer";
import sharp from "sharp";

const app = express();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE_MB = 15;

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

app.get("/", (req, res) => {
  res.json({
    status: "Image enhancer API funcionando",
    formatos_disponibles: Object.entries(FORMATS).map(([key, val]) => ({
      format: key,
      descripcion: val.label,
      resolucion: `${val.width}x${val.height}`,
    })),
    uso: "POST /enhance?format=feed|story|pinterest|linkedin|twitter",
  });
});

app.post("/enhance", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No image uploaded");
    }

    if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
      return res.status(400).send("Formato no soportado. Usa JPEG, PNG, WEBP o HEIC");
    }

    const formatKey = req.query.format || DEFAULT_FORMAT;
    const format = FORMATS[formatKey];

    if (!format) {
      return res.status(400).json({
        error: `Formato '${formatKey}' no válido.`,
        formatos_validos: Object.keys(FORMATS),
      });
    }

    const output = await sharp(req.file.buffer)
      .rotate()                              // corrige orientación EXIF
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

    res.set("Content-Type", "image/jpeg");
    res.set("X-Format-Used", formatKey);
    res.set("X-Resolution", `${format.width}x${format.height}`);
    res.send(output);

  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing image");
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Image enhancer running on port ${process.env.PORT || 3000}`);
  console.log(`Formatos disponibles: ${Object.keys(FORMATS).join(", ")}`);
});