import puppeteer from 'puppeteer';
import fs from 'fs';


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

    const records = await readMenu('legislation_menu.csv'); // Reading records from file

    const newDataset = [];

    for (let record of records) {
        const {title, url} = record;
        const tocData = await scrapeData(browser, url);
        for (let toc of tocData) {
            if (toc.text !== 'Title') {
                const newUrl = 'https://www.legislation.govt.nz' + toc.href;
                const combinedTitle = `${toc.text}(${title})`; // Combine title and toc text with a dash
                newDataset.push({description: combinedTitle, url: newUrl});
            }
        }
    }

    await browser.close();
    fs.writeFileSync('new_zealand_legislation_list.json', JSON.stringify(newDataset, null, 2)); // Writing data to file
};

mergeAndWriteData().catch(console.error);
