/**
 * Node.js Transcription Service
 * This service uses OpenAI Whisper API for audio transcription, Firebase for storage,
 * and Firestore for saving transcriptions.
 */

require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai'); // OpenAI API for transcription
const admin = require('firebase-admin'); // Firebase Admin SDK
const ffmpeg = require('fluent-ffmpeg'); // FFmpeg for audio conversion

const app = express();
const port = 3001;

// Enable CORS for handling cross-origin requests
app.use(cors());

// Check for required environment variables
if (
  !process.env.OPENAI_API_KEY ||
  !process.env.FIREBASE_PROJECT_ID ||
  !process.env.FIREBASE_CLIENT_EMAIL ||
  !process.env.FIREBASE_PRIVATE_KEY ||
  !process.env.FIREBASE_BUCKET_NAME
) {
  console.error("API keys or Firebase configurations are missing in the .env file.");
  process.exit(1);
} else {
  console.log("Environment variables loaded successfully.");
}

// Configure OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // Timeout set to 30 seconds
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

const db = admin.firestore(); // Firestore instance
const bucket = admin.storage().bucket(); // Firebase Storage bucket instance

/**
 * Retry transcription with OpenAI Whisper
 * @param {Object} openai - OpenAI client instance
 * @param {ReadableStream} fileStream - Audio file stream
 * @param {string} language - Language code for transcription
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<Object>} Transcription response from OpenAI
 */
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
      return response; // Return successful response
    } catch (error) {
      console.error(`Transcription attempt ${attempt} failed:`, error);
      if (attempt === retries) {
        console.error('All transcription attempts failed.');
        throw error; // Throw error after exhausting retries
      }
      console.log(`Retrying transcription (attempt ${attempt + 1})...`);
    }
  }
}

/**
 * POST /transcribe - Handle audio upload and transcription
 */
app.post('/transcribe', express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res) => {
  console.log("Received a request to /transcribe.");
  const audioBuffer = req.body;

  // Ensure 'uploads' directory exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    console.log("Uploads directory does not exist. Creating it...");
    fs.mkdirSync(uploadsDir);
  }

  const tempFileName = `temp_${Date.now()}`;
  const tempFilePath = path.join(uploadsDir, tempFileName);

  // Save uploaded audio data to a temporary file (without extension)
  try {
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log(`File saved temporarily at ${tempFilePath}`);
  } catch (error) {
    console.error("Error saving temporary audio file:", error);
    return res.status(500).send("Error saving audio file.");
  }

  // Set the output format and converted file path
  const outputFormat = 'mp3';
  const convertedFilePath = path.join(uploadsDir, `${tempFileName}.${outputFormat}`);

  try {
    // Convert the audio file to the desired format using FFmpeg
    console.log(`Converting audio file to ${outputFormat} format...`);
    await new Promise((resolve, reject) => {
      ffmpeg(tempFilePath)
        .output(convertedFilePath)
        .on('end', () => {
          console.log(`Conversion successful: ${convertedFilePath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error("Error during conversion:", err);
          reject(err);
        })
        .run();
    });

    // Upload the converted file to Firebase Storage
    console.log("Uploading converted file to Firebase Storage...");
    const destination = `audio/${path.basename(convertedFilePath)}`;
    await bucket.upload(convertedFilePath, { destination });
    const fileURL = `gs://${bucket.name}/${destination}`;
    console.log(`File uploaded to Firebase Storage at ${fileURL}`);

    // Set transcription language (default to Spanish)
    const language = req.query.language || "es";
    console.log(`Using language: ${language}`);

    // Transcribe audio using OpenAI Whisper
    console.log("Sending transcription request to OpenAI Whisper...");
    const response = await transcribeWithRetry(openai, fs.createReadStream(convertedFilePath), language);

    const transcription = response.text;
    console.log(`Transcription success: ${transcription}`);

    // Save transcription in Firestore
    console.log("Saving transcription to Firestore...");
    const docRef = db.collection('transcriptions').doc(); // Generate a new Firestore document
    await docRef.set({
      transcription,
      language,
      fileURL, // Store the Firebase Storage file URI
      timestamp: new Date().toISOString(),
    });
    console.log("Transcription saved successfully in Firestore.");

    // Respond with the transcription result
    res.json({ transcription, message: "Transcription saved to Firebase Firestore successfully!" });
  } catch (error) {
    console.error("Error during transcription process:", error);
    res.status(500).send("Error processing audio file.");
  } finally {
    // Delete the temporary files
    try {
      console.log(`Deleting temporary files: ${tempFilePath}, ${convertedFilePath}`);
      fs.unlinkSync(tempFilePath);
      fs.unlinkSync(convertedFilePath);
      console.log("Temporary files deleted.");
    } catch (unlinkError) {
      console.error("Error deleting temporary files:", unlinkError);
    }
  }
});

/**
 * GET / - Health check endpoint
 */
app.get('/', (req, res) => {
  console.log("Health check endpoint hit.");
  res.send("Server is running.");
});

// Start the server
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
