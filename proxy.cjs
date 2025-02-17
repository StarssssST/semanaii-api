const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();

app.use(express.json());

// Bypass CORS entirely
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Helper untuk fetch konten
async function fetchContent(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        throw error;
    }
}

// Handle chapter request
app.get('/chapter/:url(*)', async (req, res) => {
    try {
        const url = decodeURIComponent(req.params.url);
        const fullUrl = url.startsWith('http') ? url : `https://komiku.id/${url}`;
        
        console.log('Fetching chapter:', fullUrl);
        const html = await fetchContent(fullUrl);
        const $ = cheerio.load(html);
        
        // Extract images
        const images = [];
        $('#Baca_Komik img').each((_, img) => {
            const src = $(img).attr('src');
            if (src && !src.includes('iklan')) {
                images.push({
                    src: src.startsWith('http') ? src : `https:${src}`,
                    alt: $(img).attr('alt') || ''
                });
            }
        });

        res.json({
            title: $('#Baca_Komik h1').text().trim(),
            images: images
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
