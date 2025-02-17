const express = require('express');
const path = require('path');
const https = require('https');
const cors = require('cors');

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP error! status: ${res.statusCode}`));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'OPTIONS'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: err.message,
        path: req.path
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

app.get('/api/proxy/chapter/:url(*)', async (req, res) => {
    try {
        // Fix URL encoding issues
        const decodedUrl = decodeURIComponent(req.params.url);
        const url = decodedUrl.startsWith('http') ? 
            decodedUrl : 
            `https://komiku.id${decodedUrl}`;

        console.log(`Fetching chapter: ${url}`);
        const html = await makeRequest(url);
        res.send(html);
    } catch (error) {
        console.error('Error fetching chapter:', error);
        res.status(500).json({ 
            error: error.message,
            url: req.params.url
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