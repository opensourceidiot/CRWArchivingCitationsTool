const https = require('https');
const fs = require('fs');

const CONFIG = {
    wikiUrl: 'https://consumerrights.wiki', //Wiki URL
    batchSize: 50, //You can go with more pages per batch, but 50 is stable value.
    userAgent: 'CRWCitationBot', //rename if you need it
    outputFile: 'unarchived-urls.json', //you can also rename output file
    archives: ['web.archive.org', 'archive.is', 'archive.today', 'archive.ph', 'ghostarchive.org', 'perma.cc', 'preservetube.com'] //List of archives. You can add own ones
};

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': CONFIG.userAgent
            }
        }, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Failed to parse JSON response'));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function getAllPageTitles() { //gets all pages
    const titles = [];
    let continueToken = null;

    do {
        const params = new URLSearchParams({
            action: 'query',
            list: 'allpages',
            aplimit: CONFIG.batchSize,
            format: 'json'
        });

        if (continueToken) {
            params.append('apcontinue', continueToken);
        }

        const url = `${CONFIG.wikiUrl}/api.php?${params}`;
        const response = await makeRequest(url);

        if (response.query && response.query.allpages) {
            const pages = response.query.allpages;
            titles.push(...pages.map(p => p.title));
        }

        continueToken = response.continue ? response.continue.apcontinue : null;
    } while (continueToken);

    console.log(`Total pages found: ${titles.length}`);
    return titles;
}

function extractUnarchiveUrls(citationText) {
    const urls = [];

    const urlPattern = /https?:\/\/[^\s\]}<|]+/gi;
    const foundUrls = citationText.match(urlPattern) || [];

    const hasArchive = /\|\s*archive[-_]?url\s*=\s*https?:\/\//i.test(citationText); //Regex that extracts if url is not archived

    if (!hasArchive && foundUrls.length > 0) {
        const archiveDomains = CONFIG.archives;

        foundUrls.forEach(url => {
            const isArchiveUrl = archiveDomains.some(domain => url.includes(domain));
            if (!isArchiveUrl) {
                urls.push(url);
            }
        });
    }

    return urls;
}

function extractCitations(wikitext) {
    const citations = [];

    const refPattern = /<ref[^>]*>(.*?)<\/ref>/gi;
    let match;

    while ((match = refPattern.exec(wikitext)) !== null) {
        const citation = match[1].trim();
        const unarchiveUrls = extractUnarchiveUrls(citation);

        if (unarchiveUrls.length > 0) {
            citations.push({
                type: 'inline_ref',
                content: citation,
                unarchivedUrls: unarchiveUrls,
                urlCount: unarchiveUrls.length
            });
        }
    }

    const citationTemplates = /\{\{[Cc]it[ae][^}]*\}\}/g;
    while ((match = citationTemplates.exec(wikitext)) !== null) {
        const template = match[0];
        const unarchiveUrls = extractUnarchiveUrls(template);

        if (unarchiveUrls.length > 0) {
            citations.push({
                type: 'citation_template',
                content: template,
                unarchivedUrls: unarchiveUrls,
                urlCount: unarchiveUrls.length
            });
        }
    }

    return citations;
}

async function getCitationsFromPages(titles) {
    const allCitations = [];

    for (let i = 0; i < titles.length; i += CONFIG.batchSize) {
        const batch = titles.slice(i, i + CONFIG.batchSize);
        const params = new URLSearchParams({
            action: 'query',
            titles: batch.join('|'),
            prop: 'revisions',
            rvprop: 'content',
            rvslots: 'main',
            format: 'json'
        });

        const url = `${CONFIG.wikiUrl}/api.php?${params}`;

        try {
            const response = await makeRequest(url);

            if (response.query && response.query.pages) {
                const pages = response.query.pages;

                for (const pageId in pages) {
                    const page = pages[pageId];

                    if (page.revisions && page.revisions[0]) {
                        const content = page.revisions[0].slots.main['*'];
                        const citations = extractCitations(content);

                        if (citations.length > 0) {
                            const allUrls = new Set();
                            citations.forEach(cit => {
                                cit.unarchivedUrls.forEach(url => allUrls.add(url));
                            });

                            allCitations.push({
                                pageUrl: `${CONFIG.wikiUrl}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
                                unarchivedUrls: Array.from(allUrls)
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing batch starting at ${i}:`, error.message);
        }
    }

    return allCitations;
}

async function main() {
    try {
        console.log(`Starting...`);
        const titles = await getAllPageTitles();

        console.log(`\nProcessing ${titles.length} pages...`);
        const citationData = await getCitationsFromPages(titles);

        console.log('\nSUMMARY');
        console.log('============================');
        console.log(`Total pages with unarchived URLs: ${citationData.length}`);

        const totalUrls = citationData.reduce((sum, page) => sum + page.unarchivedUrls.length, 0);
        console.log(`Total unarchived URLs found: ${totalUrls}`);

        fs.writeFileSync(CONFIG.outputFile, JSON.stringify(citationData, null, 2));
        console.log(`\nResults saved to: ${CONFIG.outputFile}`);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();