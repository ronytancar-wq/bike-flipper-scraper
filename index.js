const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const OpenAI = require('openai');
require('dotenv').config();

// Firebase init
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_KEY))
});
const db = admin.firestore();

// OpenAI init
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const BAZOS_URL = 'https://sport.bazos.sk/horska/?hledat=&rubriky=sport&hlokalita=90201&humkreis=25&cenaod=&cenado=150&order=&crp=&kitx=ano';

const PROMPT = `Si "Bike Flip Analyzer" - specializovany analytik na zhodnocovanie bicyklov.
Analyzuj bic ykl striktne:
1. Skontroluj realnu hodnotu na trhu
2. Porovnaj predajnu cenu vs akualnu
3. Zhodnoties tav bicykla - ci je vyhodny nakup
4. Hodnoties aj podla fotky
Odpoved v JSON: {"recommendation": "BUY/MAYBE/SKIP", "analysis": "...", "profitPotential": "...", "condition": "...", "score": 1-100}`;

async function scrapeBazos() {
  console.log('Staring scrape...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  
  try {
    await page.goto(BAZOS_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract bikes
    const bikes = await page.evaluate(() => {
return Array.from(document.querySelectorAll('a[href^="/inzerat/"]')).map(el => {        const title = el.querySelector('h2 a')?.textContent?.trim() || '';
        const price = el.querySelector('.price')?.textContent?.match(/\d+/)?.[0] || '';
        const link = el.querySelector('h2 a')?.href || '';
        const img = el.querySelector('img')?.src || '';
        const desc = el.querySelector('.desc')?.textContent?.trim() || '';
        return { title, price, link, img, desc };
      }).filter(b => b.title && b.price);
    });
    
    console.log(`Found ${bikes.length} bikes`);
    
    // Analyze each bike
    for (const bike of bikes) {
      try {
        // Check if already exists
        const existing = await db.collection('analyzed_bikes').doc(bike.link).get();
        if (existing.exists) {
          console.log(`Bike ${bike.title} already analyzed, skipping`);
          continue;
        }
        
        // Download image for analysis
        let base64Image = '';
        if (bike.img) {
          try {
            const imgResponse = await page.goto(bike.img);
            const buf = await imgResponse.buffer();
            base64Image = buf.toString('base64');
          } catch(e) {
            console.log(`Could not download image: ${e.message}`);
          }
        }
        
        // Send to OpenAI Vision
        const analysisPrompt = `${PROMPT}\n\nBicykel: ${bike.title}\nCena: €${bike.price}\nPopis: ${bike.desc}`;
        
        let analysis = { recommendation: 'SKIP', analysis: 'Could not analyze', profitPotential: 0, condition: 'Unknown', score: 0 };
        
        try {
          if (base64Image) {
            const response = await openai.vision.v1.messages.create({
              model: 'gpt-4-vision-preview',
              max_tokens: 1024,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: analysisPrompt },
                    { type: 'image', image: { data: base64Image, media_type: 'image/jpeg' } }
                  ]
                }
              ]
            });
            analysis = JSON.parse(response.content[0].text);
          } else {
            const response = await openai.chat.completions.create({
              model: 'gpt-4',
              messages: [{ role: 'user', content: analysisPrompt }],
              temperature: 0.5
            });
            analysis = JSON.parse(response.choices[0].message.content);
          }
        } catch(e) {
          console.log(`OpenAI error: ${e.message}`);
        }
        
        // Save to Firestore
        await db.collection('analyzed_bikes').doc(bike.link).set({
          title: bike.title,
          price: parseInt(bike.price),
          link: bike.link,
          image: bike.img,
          description: bike.desc,
          analysis: analysis,
          createdAt: new Date(),
          buyPrice: parseInt(bike.price),
          sellPrice: parseInt(bike.price) * 2,
          profit: parseInt(bike.price),
          roi: 100
        });
        
        console.log(`Saved: ${bike.title}`);
      } catch(e) {
        console.error(`Error processing bike: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }
}

scrapeBazos().catch(console.error);
