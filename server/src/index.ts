import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { openaiRouter } from './routes/openai.js';
import { csvRouter } from './routes/csv.js';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['AZURE_ENDPOINT', 'AZURE_KEY', 'AZURE_MODEL', 'SOCRATA_APP_TOKEN'] as const;
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:');
    missingEnvVars.forEach((envVar) => console.error(`  - ${envVar}`));
    console.error('\nPlease create a .env file with these variables. See .env.example for reference.');
    process.exit(1);
}

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json({limit: '50mb'}));

// Health check
app.get('/health', (_req, res) => {
    res.json({status: 'ok', timestamp: new Date().toISOString()});
});

// API routes
app.use('/api/openai', openaiRouter);
app.use('/api/csv', csvRouter);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({error: err.message || 'Internal server error'});
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});
