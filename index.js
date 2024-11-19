require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const admin = require('firebase-admin');

const app = express();
const port = 3001;

app.use(cors());

// Ensure required environment variables are set
if (!process.env.OPENAI_API_KEY || !process.env.FIREBASE_PROJECT_ID) {
  console.error("API keys or Firebase configurations are missing in the .env file.");
  process.exit(1);
} else {
  console.log("Environment variables loaded successfully.");
}

// Configure OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // Set timeout to 30 seconds
});

// Initialize Firebase Admin SDK for Firestore and Storage
try {
  console.log("Attempting to initialize Firebase...");
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.FIREBASE_BUCKET_NAME,
  });
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase:", error);
  process.exit(1);
}

const db = admin.firestore(); // Firestore reference
const bucket = admin.storage().bucket(); // Firebase Storage reference

// Retry function for the transcription request
async function transcribeWithRetry(openai, fileStream, language, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Sending transcription request...`);
      const response = await openai.audio.transcriptions.create({
        file: fileStream,
        model: "whisper-1",
        language,
      });
      console.log(`Transcription attempt ${attempt} successful.`);
      return response;
    } catch (error) {
      console.error(`Transcription attempt ${attempt} failed:`, error);
      if (attempt === retries) {
        console.error('All transcription attempts failed.');
        throw error;
      }
      console.log(`Retrying transcription (attempt ${attempt + 1}) after error: ${error.message || error}`);
    }
  }
}

// Endpoint to handle audio upload and transcription
app.post('/transcribe', express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
  console.log("Received a request to /transcribe.");
  const audioBuffer = req.body;

  // Ensure the 'uploads' directory exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    console.log("Uploads directory does not exist. Creating it...");
    fs.mkdirSync(uploadsDir);
  }

  const tempFilePath = path.join(__dirname, 'uploads', `temp_${Date.now()}.webm`);

  // Save the raw audio data temporarily
  try {
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log(`File saved temporarily at ${tempFilePath}`);
  } catch (fileError) {
    console.error('Error saving temporary audio file:', fileError);
    return res.status(500).send("Error saving audio file.");
  }

  try {
    // Upload file to Firebase Storage
    console.log("Uploading file to Firebase Storage...");
    const destination = `audio/${path.basename(tempFilePath)}`;
    await bucket.upload(tempFilePath, { destination });
    const fileURL = `gs://${bucket.name}/${destination}`;
    console.log(`File uploaded to Firebase Storage at ${fileURL}`);

    // Set transcription language (default to Spanish if not provided)
    const language = req.query.language || "es";
    console.log(`Using language: ${language}`);

    // Transcribe audio using OpenAI Whisper with retry logic
    console.log("Sending transcription request to OpenAI Whisper...");
    const response = await transcribeWithRetry(openai, fs.createReadStream(tempFilePath), language);

    const transcription = response.text;
    console.log(`Transcription success: ${transcription}`);

    // Save transcription in Firestore
    console.log("Saving transcription to Firestore...");
    const docRef = db.collection('transcriptions').doc(); // Generate new document
    await docRef.set({
      transcription,
      language,
      fileURL, // Store the Firebase Storage URI for reference
      timestamp: new Date().toISOString(),
    });
    console.log("Transcription saved successfully in Firestore.");

    res.json({ transcription, message: 'Transcription saved to Firebase Firestore successfully!' });
  } catch (error) {
    console.error('Error during transcription process:', error);
    res.status(500).send("Error processing audio file.");
  } finally {
    // Clean up temporary file
    try {
      console.log(`Deleting temporary file: ${tempFilePath}`);
      fs.unlinkSync(tempFilePath);
      console.log(`Temporary file ${tempFilePath} deleted.`);
    } catch (unlinkError) {
      console.error('Error deleting temporary file:', unlinkError);
    }
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  console.log("Health check endpoint hit.");
  res.send('Server is running.');
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
