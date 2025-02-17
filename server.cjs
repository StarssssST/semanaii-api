const express = require('express');
const path = require('path');
const https = require('https');
const cors = require('cors');

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            followRedirect: true,
            timeout: 10000
        };

        const request = https.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                console.log(`Redirecting to: ${res.headers.location}`);
                return makeRequest(res.headers.location);
            }

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP error! status: ${res.statusCode}`));
                }
            });
        });

        request.on('error', (err) => reject(err));
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

const app = express();

// More comprehensive CORS configuration
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if(!origin) return callback(null, true);
        callback(null, true); // Allow all origins
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    maxAge: 86400, // Cache preflight requests for 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

// Add options handler for preflight requests
app.options('*', cors());

// Add response headers middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add better error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: {
            message: err.message,
            code: err.status || 500,
            path: req.path,
            timestamp: new Date().toISOString()
        }
    });
});

// Health check route
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Proxy routes with better error handling
app.get('/api/proxy/manga/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const url = `https://komiku.id/manga/${slug}/`;
        console.log(`Fetching manga: ${url}`);
        const html = await makeRequest(url);
        res.send(html);
    } catch (error) {
        console.error('Error fetching manga:', error);
        res.status(500).json({ 
            error: error.message,
            slug: req.params.slug
        });
    }
});

// Updated chapter route with better URL handling
app.get('/api/proxy/chapter/:url(*)', async (req, res) => {
    try {
        let decodedUrl = decodeURIComponent(req.params.url);
        
        // Clean up URL
        decodedUrl = decodedUrl.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
        decodedUrl = decodedUrl.replace(/\/+/g, '/'); // Remove multiple consecutive slashes
        
        // Construct full URL
        const url = decodedUrl.startsWith('http') ? 
            decodedUrl : 
            `https://komiku.id/${decodedUrl}`;

        console.log(`Fetching chapter URL:`, url);
        
        const html = await makeRequest(url);
        
        // Set proper headers
        res.header('Content-Type', 'text/html; charset=utf-8');
        res.header('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.send(html);
        
    } catch (error) {
        console.error('Error fetching chapter:', error);
        res.status(500).json({
            error: {
                message: error.message,
                url: req.params.url,
                timestamp: new Date().toISOString()
            }
        });
    }
});

app.get('/api/proxy/list', async (req, res) => {
    try {
        const url = 'https://komiku.id/daftar-komik/';
        console.log(`Fetching manga list: ${url}`);
        const html = await makeRequest(url);
        res.send(html);
    } catch (error) {
        console.error('Error fetching manga list:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});