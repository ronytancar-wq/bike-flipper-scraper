const axios = require('axios');
const cheerio = require('cheerio');
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

const PROMPT = 'Sí "Bike Flip Analyzer" - špecializovaný analytik na zhodnocovanie bicyklov.';

async function scrapeBazos() {
  try {
    console.log('Starting scrape...');
    
    // Fetch HTML
    const { data } = await axios.get(BAZOS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(data);
    const bikes = [];
    
    // Find all bike listings - search for h2 links
    $('h2 a').each((i, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();
      
      if (href && href.includes('/inzerat/')) {
        const link = 'https://sport.bazos.sk' + href;
        bikes.push({
          title: title,
          link: link,
          id: href.split('/')[2]
        });
      }
    });
    
    console.log(`Found ${bikes.length} bikes`);
    
    if (bikes.length === 0) {
      console.log('No bikes found, trying alternative selector...');
      $('div[id]').each((i, el) => {
        const link = $(el).find('a[href*="/inzerat/"]').attr('href');
        if (link && bikes.length < 100) {
          bikes.push({
            title: $(el).text().substring(0, 100).trim(),
            link: 'https://sport.bazos.sk' + link,
            id: link.split('/')[2]
          });
        }
      });
      console.log(`Found ${bikes.length} bikes with alternative selector`);
    }
    
    // Analyze each bike
    for (const bike of bikes) {
      try {
        // Check if already processed
        const existing = await db.collection('analyzed_bikes').doc(bike.id).get();
        if (existing.exists) {
          console.log(`Bike ${bike.id} already processed`);
          continue;
        }
        
        // Get image URL from bike page
        let imageUrl = '';
        try {
          const bikePageResponse = await axios.get(bike.link, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
          });
          const bikePage$ = cheerio.load(bikePageResponse.data);
          imageUrl = bikePage$('img').first().attr('src') || '';
          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = 'https://sport.bazos.sk' + imageUrl;
          }
        } catch (err) {
          console.log(`Could not fetch image for ${bike.id}: ${err.message}`);
        }
        
        // Analyze with OpenAI Vision if image available
        let analysis = { recommendation: 'Analysis pending' };
        if (imageUrl) {
          try {
            const response = await openai.chat.completions.create({
              model: 'gpt-4-vision',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: PROMPT },
                    { type: 'image_url', image_url: { url: imageUrl } }
                  ]
                }
              ],
              max_tokens: 200
            });
            analysis = {
              recommendation: response.choices[0].message.content,
              analyzed_at: new Date()
            };
          } catch (err) {
            console.log(`OpenAI analysis failed for ${bike.id}: ${err.message}`);
            analysis = { recommendation: 'Analysis failed', error: err.message };
          }
        }
        
        // Save to Firestore
        await db.collection('analyzed_bikes').doc(bike.id).set({
          title: bike.title,
          link: bike.link,
          imageUrl: imageUrl,
          analysis: analysis,
          scrape_date: new Date(),
          status: 'completed'
        });
        
        console.log(`Saved bike: ${bike.title}`);
      } catch (err) {
        console.log(`Error processing bike ${bike.id}: ${err.message}`);
      }
    }
    
    console.log('Scrape completed successfully');
  } catch (err) {
    console.error('Scrape error:', err);
    throw err;
  }
}

scrapeBazos();
