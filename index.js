import puppeteer from 'puppeteer';
import fs from 'fs';

// Increase the navigation timeout for Puppeteer
const navigationOptions = {
    waitUntil: 'networkidle2',
    timeout: 60000 // Setting timeout to 60 seconds
};

// Function to process specific URLs to extract titles and subtitles
const processUrls = async (browser, urls) => {
    const results = [];
    for (let url of urls) {
        const page = await browser.newPage();
        await page.goto(url, navigationOptions);
        const {title, subtitle} = await page.evaluate(() => {
            const h1Text = document.querySelector('h1') ? document.querySelector('h1').innerText : null;
            const h2Text = document.querySelector('h2') ? document.querySelector('h2').innerText : h1Text; // Use h1 value if h2 does not exist
            return {title: h1Text, subtitle: h2Text};
        });
        results.push({url, title, subtitle});
        await page.close();
    }
    return results;
};

// Function to read URLs from a file
const readUrlsFromFile = (filePath) => {
    const data = fs.readFileSync(filePath, 'utf8');
    return data.split('\n').filter(line => line.trim() !== '').map(line => line.trim());
};

// Read records from legislation_menu.csv
const readMenu = async (filePath) => {
    const data = fs.readFileSync(filePath, 'utf8');
    return data.split('\n').map(line => {
        const [title, url] = line.split(',');
        return {title, url};
    }).filter(record => record.title && record.url);
};

// Function to scrape data from legislation.govt.nz
const scrapeData = async (browser, url) => {
    const page = await browser.newPage();
    console.log(url);
    await page.goto(url);
    const tocData = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.tocentrylayout tbody tr'));
        return rows.map(row => {
            const sectionNumber = row.querySelector('td.tocColumn1 a.toc') ? row.querySelector('td.tocColumn1 a.toc').innerText : '';
            const anchor = row.querySelector('td.tocColumn2 a.toc');
            const text = anchor ? `Section ${sectionNumber}: ${anchor.innerText}` : '';
            const href = anchor ? anchor.getAttribute('href') : '';
            return {text, href};
        }).filter(entry => entry.text && entry.href);
    });
    await page.close();
    return tocData;
};

// Main function to merge data and write to a file
const mergeAndWriteData = async () => {
    const browser = await puppeteer.launch({headless: false});
    const urls = readUrlsFromFile("just_content.csv"); // Reading URLs from file
    const specificUrlsResults = await processUrls(browser, urls); // Processing specific URLs
    const records = await readMenu('legislation_menu.csv'); // Reading records from file

    const newDataset = [];

    for (let record of records) {
        const {title, url} = record;
        const tocData = await scrapeData(browser, url);
        for (let toc of tocData) {
            if (toc.text !== 'Title') {
                const newUrl = 'https://www.legislation.govt.nz' + toc.href;
                newDataset.push({title, subTitle: toc.text, url: newUrl});
            }
        }
    }

    await browser.close();
    const finalDataset = [...specificUrlsResults, ...newDataset]; // Combining datasets

    fs.writeFileSync('new_zealand_legislation_list.json', JSON.stringify(finalDataset, null, 2)); // Writing data to file
};

mergeAndWriteData().catch(console.error);
