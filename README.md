# Bazos.sk Bicycle Scraper - Cloud Run Deployment Guide

## Projekt "Bicyklový čávo 1.0 - 11/2025"

Automatický scraper bicyklov z Bazos.sk, ktorý:
- Scrapuje nové inzeráty každých 12 hodín
- Analyzuje każdy bicykel s OpenAI Vision API
- Ukladá výsledky do Firebase Firestore
- Vyhodnocuje potenciál nákupu na flipovanie

## Súbory

- `index.js` - Hlavný Node.js skript s Puppeteer, OpenAI a Firestore integráciou
- `package.json` - npm závislosti a konfigurácia
- `Dockerfile` - Docker image pre Cloud Run
- `.env.example` - Príklad premenných prostredia

## Rýchly štart - Cloud Run Deployment

### 1. Príprava - naklonuj repo
```bash
git clone https://github.com/ronytancar-wq/bike-flipper-scraper.git
cd bike-flipper-scraper
```

### 2. Postav a deployuj na Cloud Run
```bash
# Nastav projekt
gcloud config set project bike-flip-analyzer

# Build a deploy
gcloud run deploy bike-flipper-scraper \\
  --source . \\
  --platform managed \\
  --region europe-west1 \\
  --memory 2G \\
  --timeout 3600 \\
  --set-env-vars FIREBASE_KEY='<paste firebase key>',OPENAI_API_KEY='<paste openai key>'
```

### 3. Nastav Cloud Scheduler na 12-hodinový interval
```bash
gcloud scheduler jobs create http bike-flipper-trigger \\
  --schedule "0 */12 * * *" \\
  --uri https://<your-cloud-run-url>/invoke \\
  --http-method POST \\
  --oidc-service-account-email <your-service-account>@iam.gserviceaccount.com
```

## Požadované Premenné Prostredia

Nastavíš v Cloud Run deployment:

- `FIREBASE_KEY` - Firebase Service Account JSON kľúč (ako string)
- `OPENAI_API_KEY` - OpenAI API kľúč (sk-...)

## Automatické Spustenie

Každých 12 hodín:
1. Cloud Scheduler spustí HTTP POST na Cloud Run funkciu
2. Puppeteer scrapne nové inzeráty z Bazos.sk
3. OpenAI Vision API analyzuje fotky
4. Výsledky uložíš v Firestore `analyzed_bikes` kolekčne
5. Hlavná aplikácia autom. zloaduje nové dáta

## Status

✅ Scraper logika dokončená
✅ Dockerfile pripravený
✅ Konfigurácia prostredia
⏳ Cloud Run deployment (manuálne cez Cloud Shell)
⏳ Cloud Scheduler automatizácia
⏳ Firestore → Dashboard integrácia
