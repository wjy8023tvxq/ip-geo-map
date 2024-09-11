const express = require('express');
const path = require('path');
const fs = require('fs');
const geoip = require('fast-geoip');
const { Parser } = require('json2csv');
const multer = require('multer');

const regionCoordinates = require('./regionCoordinates');

const app = express();
const port = 3000;

// Configure EJS as the template engine
app.set('view engine', 'ejs');

// Serve static files (e.g., map.html)
app.use(express.static('public'));

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer setup for handling file uploads
const upload = multer({ dest: 'uploads/' });

// Get representative coordinates for a given region
function getCoordinatesForRegion(region) {
    return regionCoordinates[region] || regionCoordinates['Unknown'];
}

// Function to aggregate IPs by region
async function aggregateIPsByRegion(ipList) {
    const regionCounts = {};

    for (const ip of ipList) {
        const geo = await geoip.lookup(ip);
        const region = geo && geo.region ? geo.region : 'Unknown';
        if (region in regionCounts) {
            regionCounts[region] += 1;
        } else {
            regionCounts[region] = 1;
        }
    }

    return regionCounts;
}

// Function to save the formatted data to a CSV file
function saveMappingDataToCsv(outputPath, formattedData) {
    const fields = ['region', 'latitude', 'longitude', 'count'];
    const opts = { fields, delimiter: ',' };
    const parser = new Parser(opts);

    const csv = parser.parse(formattedData);
    fs.writeFileSync(outputPath, csv, 'utf8');

    console.log(`Mapping data saved to ${outputPath}`);
}
// Function to format aggregated data with coordinates for mapping
function formatDataForMapping(regionCounts) {
    const formattedData = [];

    for (const region in regionCounts) {
        const count = regionCounts[region];
        const coordinates = getCoordinatesForRegion(region);

        formattedData.push({
            region: region,
            latitude: coordinates.lat,
            longitude: coordinates.lng,
            count: count
        });
    }

    return formattedData;
}
// Handle the form submission and file upload
app.post('/upload', upload.single('ipfile'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const ipList = fs.readFileSync(filePath, 'utf8').split('\n').filter(ip => ip.trim() !== '');

        // Aggregate and process the IPs
        const regionCounts = await aggregateIPsByRegion(ipList);
        const formattedData = formatDataForMapping(regionCounts);

        // Ensure the outputs directory exists
        const outputDir = path.join(__dirname, 'outputs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }

        // Save the formatted data to a CSV file
        const outputFilePath = path.join(outputDir, 'mapping_data.csv');
        saveMappingDataToCsv(outputFilePath, formattedData);

        // After processing, redirect to avoid form resubmission on refresh
        res.redirect('/download-page');

    } catch (error) {
        console.error('Error processing IP data:', error);
        res.status(500).send('An error occurred while processing the file.');
    }
});


// Route to download the generated mapping data csv
app.get('/download-csv', (req, res) => {
    // Ensure the outputs directory exists
    const outputDir = path.join(__dirname, 'outputs');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }
    const file = path.join(outputDir, 'mapping_data.csv');

    // Use res.download to serve the file as a download
    res.download(file, 'mapping_data.csv', (err) => {
        if (err) {
            console.error('Error downloading the file:', err);
            res.status(500).send('Error downloading the file.');
        }
    });
});


// Route to serve the download and map page
app.get('/download-page', (req, res) => {
    res.render('index', { csvDownloadLink: '/download-csv' });
});

// Render the homepage
app.get('/', (req, res) => {
    res.render('index', { csvDownloadLink: null });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
