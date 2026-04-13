const express = require('express');
const cors = require('cors');

const { sendOTP } = require('./emailServices');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// In-memory OTP store: email -> { otp, expiresAt }
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) { return res.status(400).json({ error: "Email address is required" }); }
    try {
        const otp = await sendOTP(email);
        otpStore.set(email, { otp, expiresAt: Date.now() + OTP_TTL_MS });
        res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
        console.error("Failed to send OTP:", error);
        res.status(500).json({ error: "Failed to send verification email" });
    }
});

app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) { return res.status(400).json({ error: "Email and code are required" }); }

    const record = otpStore.get(email);

    if (!record) {
        return res.status(400).json({ error: "No code was requested for this email" });
    }
    if (Date.now() > record.expiresAt) {
        otpStore.delete(email);
        return res.status(400).json({ error: "Code has expired. Please request a new one." });
    }
    if (String(otp) !== String(record.otp)) {
        return res.status(400).json({ error: "Incorrect code" });
    }

    otpStore.delete(email); // one-time use
    res.status(200).json({ message: "Code verified" });
});

app.listen(port, () => console.log('Backend Server running on port 3000'));