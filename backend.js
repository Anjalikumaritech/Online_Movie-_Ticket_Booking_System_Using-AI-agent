// === Imports ===
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// === File paths ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === App setup ===
const app = express();
app.use(cors());
app.use(express.json());

// === Database connection ===
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 3306,
});

// === Test connection ===
try {
  const conn = await pool.getConnection();
  console.log("✅ MySQL connected successfully");
  conn.release();
} catch (err) {
  console.error("❌ Database connection failed:", err);
}

// === ROUTES ===

// --- Get movies ---
app.get("/movies", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM movies");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// --- Get showtimes ---
app.get("/showtimes", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM showtimes");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// --- Get seats for a showtime ---
app.get("/seats/:showtimeId", async (req, res) => {
  const { showtimeId } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM seats WHERE showtime_id = ?",
      [showtimeId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// --- Reserve seats temporarily ---
app.post("/reserve", async (req, res) => {
  const { showtime_id, seat_ids } = req.body;
  if (!showtime_id || !seat_ids?.length) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    await pool.query(
      "UPDATE seats SET status = 'reserved' WHERE id IN (?) AND showtime_id = ?",
      [seat_ids, showtime_id]
    );

    res.json({ success: true, message: "Seats reserved temporarily." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// --- Finalize booking & generate ticket ---
app.post("/finalize", async (req, res) => {
  const { user_name, showtime_id, seat_ids } = req.body;
  if (!user_name || !showtime_id || !seat_ids?.length) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    // Mark seats as booked
    await pool.query(
      "UPDATE seats SET status = 'booked' WHERE id IN (?) AND showtime_id = ?",
      [seat_ids, showtime_id]
    );

    // === PRICE CALCULATION (ADDED) ===
    const SEAT_PRICE = 100; // Rs. 100 per seat
    const totalPrice = seat_ids.length * SEAT_PRICE;

    // === Generate PDF Ticket ===
    const ticketPath = path.join(__dirname, `ticket_${Date.now()}.pdf`);
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(ticketPath));

    doc.fontSize(20).text("🎟 Movie Ticket", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Name: ${user_name}`);
    doc.text(`Showtime ID: ${showtime_id}`);
    doc.text(`Seats: ${seat_ids.join(", ")}`);
    doc.text(`Price per seat: ₹${SEAT_PRICE}`);
    doc.text(`Total Price: ₹${totalPrice}`);
    doc.text(`Status: Confirmed`);
    doc.end();

    res.json({
      success: true,
      message: "Booking confirmed!",
      totalPrice,
      ticket: ticketPath,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// --- AI Assistant ---
app.post("/agent", (req, res) => {
  const { question } = req.body;
  const reply = question.toLowerCase().includes("hello")
    ? "Hi there! How can I help with your booking?"
    : "I’m your movie assistant. You can ask about movies or seats!";
  res.json({ answer: reply });
});

// === Start Server ===
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
);
