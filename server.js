import express from "express";
import multer from "multer";
import sharp from "sharp";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.get("/", (req, res) => {
  res.send("Image enhancer API funcionando");
});

app.post("/enhance", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No image uploaded");

    const output = await sharp(req.file.buffer)
      .rotate()
      .resize({
        width: 1600,
        withoutEnlargement: true
      })
      .normalise()
      .sharpen()
      .modulate({
        brightness: 1.04,
        saturation: 1.08
      })
      .jpeg({
        quality: 90,
        mozjpeg: true
      })
      .toBuffer();

    res.set("Content-Type", "image/jpeg");
    res.send(output);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing image");
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Image enhancer running");
});
