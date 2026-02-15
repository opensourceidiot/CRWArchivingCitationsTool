# CRWArchivingCitationsTool
JS Based tool that gets all citations that are unarchived from Consumer Rights Wiki. Will work for any MediaWiki based wiki if you update config.

To run it, you need to install node.js. https://nodejs.org/en/download/ and select latest LTS release for your OS.

To use this code:

git clone this repo

go to CRWArchivingCitationsTool (in example cd ./CRWArchivingCitationsTool in linux/Mac terminal where you did git clone)

npm start

At this stage it will produce json with link to article and array of unarchived citation. Open viewer.html in any browser you like to see all the links in more user readable format. You will need to pick file unarchived-urls.json to use viewer. Done this way for simplicity and not making stuff like HTTP server, and because browsers protect you from opening your files on your machine throwing CORS error. 
Love yourself and stay safe. 
Frog