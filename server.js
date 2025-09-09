// server/server.js
require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(express.json());

const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: allowedOrigin }));

const limiter = rateLimit({
  windowMs: 1000 * 60 * 60, // 1 hr
  max: 200,
  message: { success: false, error: "Too many requests, try again later." },
});
app.use(limiter);

function validatePayload(body) {
  const { name, organization, contactNo } = body;
  if (!name || !name.trim()) return "Name is required";
  if (!organization || !organization.trim()) return "Organization name is required";
  if (!contactNo || !contactNo.trim()) return "Contact number is required";
  if (!/^[0-9+\-\s()]{7,20}$/.test(contactNo.trim())) return "Invalid contact number";
  return null;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((err) => {
  if (err) console.warn("Mail transporter not ready:", err.message);
  else console.log("Mail transporter ready");
});

// 🔹 Health check endpoint
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

// 🔹 Single reusable endpoint
app.post("/api/callback", async (req, res) => {
  try {
    const payload = req.body;
    const err = validatePayload(payload);
    if (err) return res.status(400).json({ success: false, error: err });

    const name = payload.name.trim();
    const org = payload.organization.trim();
    const contactNo = payload.contactNo.trim();
    const email = payload.email?.trim() || "Not provided";
    const message = payload.message?.trim() || "Not provided";
    const source = payload.source?.trim() || "Unknown Page";

    const html = `
      <h2>New Callback Request (${source})</h2>
      <table cellpadding="6">
        <tr><td><strong>Name:</strong></td><td>${escapeHtml(name)}</td></tr>
        <tr><td><strong>Organization:</strong></td><td>${escapeHtml(org)}</td></tr>
        <tr><td><strong>Contact No.:</strong></td><td>${escapeHtml(contactNo)}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${escapeHtml(email)}</td></tr>
        <tr><td><strong>Message:</strong></td><td>${escapeHtml(message)}</td></tr>
      </table>
      <p><strong>Source:</strong> ${escapeHtml(source)}</p>
      <p>Received at ${new Date().toLocaleString()}</p>
    `;

    const mailOptions = {
      from: `"Website Callback" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: process.env.CONTACT_RECEIVER_EMAIL,
      subject: `Callback Request (${source}) — ${name}`,
      html,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
  } catch (e) {
    console.error("Callback mail error:", e);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

function escapeHtml(text) {
  return text
    ? text.replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;")
    : "";
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
