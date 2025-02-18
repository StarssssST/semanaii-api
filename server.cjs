const express = require('express');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

function makeRequest(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                ...headers
            }
        };

        const req = https.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                return resolve(makeRequest(res.headers.location, headers));
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ data, headers: res.headers });
                } else {
                    reject(new Error(`HTTP error! status: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

const app = express();

// Simple request logger
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Allow all origins
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Handle preflight
app.options('*', (req, res) => res.sendStatus(200));

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Add utility function to parse image URLs
function parseImagePath(url) {
    try {
        const originalUrl = new URL(url);
        const extension = originalUrl.pathname.split('.').pop();
        return {
            originalUrl: url,
            extension: extension || 'jpg'
        };
    } catch (error) {
        console.error('Error parsing image URL:', error);
        return null;
    }
}

// Add image cache to store original URLs
const imageCache = new Map();

// Add image caching helper functions
function cacheImage(slug, filename, originalUrl) {
    const key = `${slug}/${filename}`;
    imageCache.set(key, originalUrl);
}

function getCachedImage(slug, filename) {
    const key = `${slug}/${filename}`;
    return imageCache.get(key);
}

// Modify the manga proxy endpoint
app.get('/api/proxy/manga/:slug', async (req, res) => {
    try {
        const url = `https://komiku.id/manga/${req.params.slug}/`;
        console.log('Fetching manga:', url);
        
        const { data } = await makeRequest(url);
        const $ = cheerio.load(data);
        
        // Extract table info
        const tableInfo = {};
        $('.inftable tr').each((_, row) => {
            const cells = $(row).find('td');
            const key = $(cells[0]).text().trim();
            const value = $(cells[1]).text().trim();
            tableInfo[key] = value;
        });

        // Extract genre info
        const genres = [];
        $('.genre .genre').each((_, el) => {
            genres.push($(el).text().trim());
        });

        // Modify cover image URL
        const originalCoverImg = $('.ims img').attr('src');
        if (originalCoverImg) {
            const parsedImage = parseImagePath(originalCoverImg);
            const coverFilename = `cover.${parsedImage?.extension || 'jpg'}`;
            cacheImage(req.params.slug, coverFilename, originalCoverImg);
        }
        const coverImg = originalCoverImg ? 
            `/api/image/${req.params.slug}/cover.${parseImagePath(originalCoverImg)?.extension || 'jpg'}` : '';

        // Extract chapters
        const chapters = [];
        $('#Daftar_Chapter tr').each((_, el) => {
            const $row = $(el);
            const link = $row.find('a').attr('href');
            const title = $row.find('a span').text().trim();
            const date = $row.find('.tanggalseries').text().trim();
            
            if (link && title) {
                chapters.push({ 
                    link, 
                    title,
                    date
                });
            }
        });

        // Format the response
        const mangaInfo = {
            judul: tableInfo['Judul Komik'] || '',
            judulIndonesia: tableInfo['Judul Indonesia'] || '',
            jenis: (tableInfo['Jenis Komik'] || '').replace(/[^a-zA-Z]/g, ''),
            konsepCerita: tableInfo['Konsep Cerita'] || '',
            pengarang: tableInfo['Pengarang'] || '',
            status: tableInfo['Status'] || '',
            umurPembaca: tableInfo['Umur Pembaca'] || '',
            caraBaca: tableInfo['Cara Baca'] || '',
            genres: genres,
            coverImg: coverImg,
            thumbnailImg: coverImg ? `${coverImg}?w=225` : '',
            originalCoverImg: originalCoverImg, // Store original URL but don't expose it
            chapters: chapters,
            sourceUrl: url,
            slug: req.params.slug
        };

        // Return the complete manga info
        res.json(mangaInfo);

    } catch (error) {
        console.error('Error fetching manga:', error);
        res.status(500).json({ 
            error: error.message,
            slug: req.params.slug
        });
    }
});

// Modify the chapter proxy endpoint
app.get('/api/proxy/chapter/:slug(*)', async (req, res) => {
    try {
        let slug = req.params.slug;
        
        // Clean up URL
        slug = decodeURIComponent(slug).replace(/^\/+|\/+$/g, '');
        const url = slug.startsWith('http') ? slug : `https://komiku.id/${slug}`;
        
        console.log('Fetching chapter:', url);
        
        const { data } = await makeRequest(url);
        const $ = cheerio.load(data);
        
        // Extract manga slug from URL
        const mangaSlug = url.match(/manga\/([^\/]+)/)?.[1] || 'unknown';
        
        // Modify image URLs
        const images = [];
        $('#Baca_Komik img').each((index, img) => {
            const originalSrc = $(img).attr('src');
            if (originalSrc) {
                const parsedImage = parseImagePath(originalSrc);
                if (parsedImage) {
                    const filename = `page-${index + 1}.${parsedImage.extension}`;
                    // Cache the original URL
                    cacheImage(mangaSlug, filename, originalSrc);
                    
                    images.push({
                        src: `/api/image/${mangaSlug}/${filename}`,
                        alt: $(img).attr('alt') || ''
                    });
                }
            }
        });

        // Return JSON response with chapter data
        res.json({
            title: $('#Baca_Komik h1').text().trim(),
            images: images
        });

    } catch (error) {
        console.error('Error fetching chapter:', error);
        res.status(500).json({ 
            error: error.message,
            url: req.params.slug 
        });
    }
});

// List proxy
app.get('/api/proxy/list', async (req, res) => {
    try {
        const url = 'https://komiku.id/daftar-komik/';
        console.log('Fetching manga list:', url);
        
        const { data } = await makeRequest(url);
        const $ = cheerio.load(data);
        
        const mangaList = [];
        $('.daftar > .bge').each((_, el) => {
            const $item = $(el);
            const link = $item.find('a').attr('href');
            const title = $item.find('h3').text().trim();
            if (link && title) {
                mangaList.push({ link, title });
            }
        });

        res.json(mangaList);

    } catch (error) {
        console.error('Error fetching list:', error);
        res.status(500).json({ error: error.message });
    }
});

// Image proxy to bypass CORS
app.get('/api/proxy/image', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        if (!imageUrl) {
            return res.status(400).json({ error: 'No image URL provided' });
        }

        const { data, headers } = await makeRequest(imageUrl);
        
        // Forward content-type and other relevant headers
        res.set('Content-Type', headers['content-type']);
        res.set('Cache-Control', 'public, max-age=31536000');
        
        res.send(data);

    } catch (error) {
        console.error('Error proxying image:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add new image proxy endpoint with pattern matching
app.get('/api/image/:slug/:filename', async (req, res) => {
    try {
        const { slug, filename } = req.params;
        
        // Try to get cached original URL
        let originalUrl = getCachedImage(slug, filename);
        
        // If not in cache, try to fetch it
        if (!originalUrl) {
            if (filename.startsWith('cover')) {
                const { data } = await makeRequest(`https://komiku.id/manga/${slug}/`);
                const $ = cheerio.load(data);
                originalUrl = $('.ims img').attr('src');
                if (originalUrl) {
                    cacheImage(slug, filename, originalUrl);
                }
            } else {
                // For chapter images, we need the original URL
                originalUrl = req.query.original;
            }
        }

        if (!originalUrl) {
            throw new Error(`Original image URL not found for ${filename}`);
        }

        // Add proper headers for image proxy
        const response = await makeRequest(originalUrl, {
            'Accept': 'image/*',
            'Referer': 'https://komiku.id/'
        });

        // Set response headers
        res.set({
            'Content-Type': response.headers['content-type'] || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
            'Content-Length': response.headers['content-length'],
            'Access-Control-Allow-Origin': '*'
        });
        
        // Send the image data
        res.send(response.data);

    } catch (error) {
        console.error('Error proxying image:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});