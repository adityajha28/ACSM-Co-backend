import express from "express";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const app = express();
const PORT = process.env.PORT || 5000;

// ====== Middleware ======
app.use(helmet());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 1000 * 60 * 60,
  max: 200,
  message: { success: false, error: "Too many requests, try again later." },
});
app.use(limiter);

// ====== AWS Secrets Manager setup ======
const SECRET_NAME = "acsm/backend/smtp"; // change to your secret name
const client = new SecretsManagerClient({ region: "ap-south-1" });

let smtpConfig = {};
let transporter;

async function loadSecrets() {
  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: SECRET_NAME,
        VersionStage: "AWSCURRENT",
      })
    );

    smtpConfig = JSON.parse(response.SecretString);
    console.log("✅ Secrets loaded from AWS Secrets Manager");
  } catch (err) {
    console.error("❌ Failed to load secrets:", err);
    process.exit(1); // exit if secrets cannot be loaded
  }
}

async function initTransporter() {
  await loadSecrets();

  transporter = nodemailer.createTransport({
    host: smtpConfig.SMTP_HOST,
    port: Number(smtpConfig.SMTP_PORT || 465),
    secure: smtpConfig.SMTP_SECURE === "true",
    auth: {
      user: smtpConfig.SMTP_USER,
      pass: smtpConfig.SMTP_PASS,
    },
  });

  transporter.verify((err) => {
    if (err) console.warn("❌ Mail transporter not ready:", err.message);
    else console.log("✅ Mail transporter ready");
  });

  // ====== CORS setup after secrets load ======
  const allowedOrigin = smtpConfig.FRONTEND_ORIGIN || "http://localhost:5173";
  app.use(cors({ origin: allowedOrigin }));

  // ====== Start server ======
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

// ====== Routes ======
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

app.post("/api/callback", async (req, res) => {
  try {
    if (!transporter) return res.status(500).json({ success: false, error: "Mail not ready" });

    const { name, organization, contactNo, email, message, source } = req.body;

    const html = `
      <h2>New Callback Request (${source || "Unknown Page"})</h2>
      <table cellpadding="6">
        <tr><td><strong>Name:</strong></td><td>${name?.trim() || "N/A"}</td></tr>
        <tr><td><strong>Organization:</strong></td><td>${organization?.trim() || "N/A"}</td></tr>
        <tr><td><strong>Contact No.:</strong></td><td>${contactNo?.trim() || "N/A"}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${email?.trim() || "N/A"}</td></tr>
        <tr><td><strong>Message:</strong></td><td>${message?.trim() || "N/A"}</td></tr>
      </table>
      <p><strong>Source:</strong> ${source || "Unknown Page"}</p>
      <p>Received at ${new Date().toLocaleString()}</p>
    `;

    await transporter.sendMail({
      from: `"Website Callback" <${smtpConfig.SMTP_FROM || smtpConfig.SMTP_USER}>`,
      to: smtpConfig.CONTACT_RECEIVER_EMAIL,
      subject: `Callback Request (${source || "Unknown"}) — ${name || "N/A"}`,
      html,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Callback mail error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ====== Initialize ======
initTransporter();
