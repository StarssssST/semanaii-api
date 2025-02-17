const express = require('express');
const path = require('path');
const https = require('https');

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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Proxy routes
app.get('/api/proxy/manga/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const url = `https://komiku.id/manga/${slug}/`;
        console.log(`Fetching manga: ${url}`);
        const html = await makeRequest(url);
        res.send(html);
    } catch (error) {
        console.error('Error fetching manga:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/proxy/chapter/:url(*)', async (req, res) => {
    try {
        const url = req.params.url.startsWith('http') ? 
            req.params.url : 
            `https://komiku.id${req.params.url}`;
        console.log(`Fetching chapter: ${url}`);
        const html = await makeRequest(url);
        res.send(html);
    } catch (error) {
        console.error('Error fetching chapter:', error);
        res.status(500).json({ error: error.message });
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