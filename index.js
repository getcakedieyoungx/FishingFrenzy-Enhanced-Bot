const axios = require('axios');
const WebSocket = require('ws');
const chalk = require('chalk');
const fs = require('fs');

// Token dosyasını oku
let authToken;
try {
  authToken = fs.readFileSync('token.txt', 'utf8').trim();
} catch (error) {
  console.error(' Token dosyası okunamadı:', error.message);
  process.exit(1);
}

// Yapılandırma ayarları
const config = {
  authToken: authToken,
  apiBaseUrl: 'https://api.fishingfrenzy.co',
  wsUrl: 'wss://api.fishingfrenzy.co',
  fishingRange: 'mid_range', 
  is5x: false,
  delayBetweenFishing: 5000,
  retryDelay: 30000,
  maxRetries: 5,
  energyRefreshHours: 24, 
  rangeCosts: {
    'short_range': 1,
    'mid_range': 2,
    'long_range': 3
  },
  // Yeni özellikler için yapılandırma
  enableDailyClaim: true,         // Günlük ödül toplama aktif/pasif
  enableAutoSellFish: true,       // Otomatik balık satışı aktif/pasif
  minFishQualityToKeep: 3,        // Minimum saklanacak balık kalitesi (1-5 arası)
  sellFishInterval: 10,           // Her kaç balık tutma işleminden sonra satış yapılacak
  wsTimeout: 60000,               // WebSocket zaman aşımı (ms)
  wsReconnectDelay: 5000,         // WebSocket yeniden bağlanma gecikmesi (ms)
  logLevel: 'info'                // Loglama seviyesi (debug, info, warn, error)
};

// API istekleri için header'lar
const headers = {
  'accept': 'application/json',
  'accept-language': 'en-US,en;q=0.6',
  'authorization': `Bearer ${config.authToken}`, 
  'content-type': 'application/json',
  'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Brave";v="134"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'sec-gpc': '1',
  'Referer': 'https://fishingfrenzy.co/',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'cache-control': 'no-cache',
  'pragma': 'no-cache'
};

// Durum değişkenleri
let currentEnergy = 0;
let retryCount = 0;
let energyRefreshTime = null;
let fishCaughtSinceLastSell = 0;
let totalFishCaught = 0;
let dailyRewardClaimed = false;
let caughtFishInventory = [];
let lastDailyClaimCheck = null;

// Log fonksiyonları
const log = (msg) => console.log(msg); 
const logSuccess = (msg) => console.log(chalk.green(`${msg}`)); 
const logInfo = (msg) => console.log(`${msg}`); 
const logWarn = (msg) => console.log(chalk.yellow(`${msg}`)); 
const logError = (msg) => console.log(chalk.red(`${msg}`)); 
const logHighlight = (label, value) => console.log(`${label}: ${chalk.cyan(value)}`); 
const logDebug = (msg) => { 
  if (config.logLevel === 'debug') {
    console.log(chalk.gray(`[DEBUG] ${msg}`));
  }
};

// Banner göster
function displayBanner() {
  const banner = [
    chalk.cyan('=================================================='),
    chalk.cyan('    Fishing Frenzy Geliştirilmiş Bot v1.5.0     '),
    chalk.cyan('=================================================='),
    chalk.yellow('  Daily Claim: ') + (config.enableDailyClaim ? chalk.green('Aktif') : chalk.red('Pasif')),
    chalk.yellow('  Otomatik Balık Satışı: ') + (config.enableAutoSellFish ? chalk.green('Aktif') : chalk.red('Pasif')),
    chalk.yellow('  Min. Kalite (Saklama): ') + chalk.green(config.minFishQualityToKeep),
    chalk.cyan('==================================================')
  ];
  banner.forEach(line => console.log(line));
}

// Profil bilgilerini göster
function displayProfileInfo(data) {
  logSuccess('Profil Başarıyla Yüklendi!');
  logInfo(` Kullanıcı ID: ${data.userId || 'N/A'}`); 
  log(` Altın: ${data.gold || 0}`); 
  logHighlight(' Enerji', `${data.energy || 0}`); 
  log(` Balık Puanları: ${data.fishPoint || 0}`); 
  log(` Tecrübe: ${data.exp || 0}`); 
  
  if (data.level) {
    log(` Seviye: ${data.level}`);
  }
  
  if (data.expToNextLevel) {
    const expProgress = ((data.exp % data.expToNextLevel) / data.expToNextLevel * 100).toFixed(2);
    log(` Sonraki seviyeye ilerleme: %${expProgress}`);
  }
}

// Kalan süreyi formatla
function formatTimeRemaining(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const minutes = Math.floor(milliseconds / (1000 * 60)) % 60;
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`; 
}

// Envanter kontrolü
async function checkInventory() {
  try {
    const response = await axios.get(`${config.apiBaseUrl}/v1/inventory`, { headers }); 
    currentEnergy = response.data.energy || 0;
    displayProfileInfo(response.data);

    // Günlük takvimdeki günü kontrol et
    if (config.enableDailyClaim && !dailyRewardClaimed) {
      const now = new Date();
      if (!lastDailyClaimCheck || (now - lastDailyClaimCheck) > (1000 * 60 * 60)) { // saatte bir kontrol et
        await checkAndClaimDailyReward();
        lastDailyClaimCheck = now;
      }
    }

    if (currentEnergy > 0) {
      return true;
    } else {
      if (!energyRefreshTime) {
        energyRefreshTime = new Date();
        energyRefreshTime.setHours(energyRefreshTime.getHours() + config.energyRefreshHours);
      }
      return false;
    }
  } catch (error) {
    logError(`Envanter kontrolü başarısız: ${error.message}`); 
    if (error.response && error.response.status === 503) {
      logWarn('Sunucu geçici olarak kullanılamıyor, tekrar denemeden önce bekleniyor...');
    }
    return false;
  }
}

// Günlük ödül kontrolü ve toplama
async function checkAndClaimDailyReward() {
  try {
    logInfo('Günlük ödül kontrol ediliyor...');
    
    // İlk önce günlük ödüllerin durumunu kontrol et
    const checkResponse = await axios.get(`${config.apiBaseUrl}/v1/daily-rewards/status`, { headers });
    
    if (checkResponse.data && checkResponse.data.canClaim) {
      logInfo('Günlük ödül almaya hak kazandınız! Toplanıyor...');
      
      // Günlük ödülü talep et
      const claimResponse = await axios.post(`${config.apiBaseUrl}/v1/daily-rewards/claim`, {}, { headers });
      
      if (claimResponse.data && claimResponse.data.success) {
        logSuccess('Günlük ödül başarıyla toplandı!');
        
        // Ödülleri göster
        if (claimResponse.data.rewards && claimResponse.data.rewards.length > 0) {
          logInfo('Alınan ödüller:');
          claimResponse.data.rewards.forEach(reward => {
            let rewardText = `- ${reward.quantity}x ${reward.name}`;
            if (reward.type === 'Gold') {
              rewardText = chalk.yellow(rewardText);
            } else if (reward.type === 'Item') {
              rewardText = chalk.blue(rewardText);
            }
            log(rewardText);
          });
        }
        
        dailyRewardClaimed = true;
        return true;
      } else {
        logError('Günlük ödül toplanamadı.');
      }
    } else {
      logInfo('Şu anda alınabilecek günlük ödül yok.');
      if (checkResponse.data && checkResponse.data.nextResetTime) {
        const nextReset = new Date(checkResponse.data.nextResetTime);
        const timeUntilReset = nextReset - new Date();
        logInfo(`Bir sonraki ödül: ${formatTimeRemaining(timeUntilReset)}`);
      }
    }
  } catch (error) {
    logError(`Günlük ödül kontrolü sırasında hata: ${error.message}`);
    if (error.response) {
      logDebug(`Hata detayı: ${JSON.stringify(error.response.data)}`);
    }
  }
  
  return false;
}

// Balıkları sat
async function sellFish() {
  if (!config.enableAutoSellFish || caughtFishInventory.length === 0) {
    return false;
  }
  
  try {
    logInfo('Balıklar satılıyor...');
    
    // Satılacak ve saklanacak balıkları filtrele
    const fishesToSell = caughtFishInventory.filter(fish => 
      fish.quality < config.minFishQualityToKeep
    );
    
    if (fishesToSell.length === 0) {
      logInfo('Satılacak balık yok. Tüm balıklar minimum kalite eşiğinin üzerinde.');
      return false;
    }
    
    const fishIds = fishesToSell.map(fish => fish.id);
    
    // Balıkları sat
    const response = await axios.post(`${config.apiBaseUrl}/v1/inventory/sell-fish`, {
      fishIds: fishIds
    }, { headers });
    
    if (response.data && response.data.success) {
      const totalGold = fishesToSell.reduce((total, fish) => total + (fish.sellPrice || 0), 0);
      logSuccess(`${fishesToSell.length} balık başarıyla satıldı! +${totalGold} altın kazanıldı.`);
      
      // Satılan balıkları envanterden kaldır
      caughtFishInventory = caughtFishInventory.filter(fish => 
        fish.quality >= config.minFishQualityToKeep
      );
      
      fishCaughtSinceLastSell = 0;
      return true;
    } else {
      logError('Balık satışı başarısız oldu.');
      return false;
    }
  } catch (error) {
    logError(`Balık satışı sırasında hata: ${error.message}`);
    if (error.response) {
      logDebug(`Hata detayı: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// Balık tutma menzilini seç
function selectFishingRange() {
  const availableRanges = [];
  if (currentEnergy >= config.rangeCosts['long_range']) {
    availableRanges.push('long_range');
  }
  if (currentEnergy >= config.rangeCosts['mid_range']) {
    availableRanges.push('mid_range');
  }
  if (currentEnergy >= config.rangeCosts['short_range']) {
    availableRanges.push('short_range');
  }
  if (availableRanges.length === 0) {
    logWarn("Mevcut enerji ile kullanılabilecek balık tutma menzili yok!");
    return 'short_range';
  }
  const selectedRange = availableRanges[Math.floor(Math.random() * availableRanges.length)];
  if (config.fishingRange !== selectedRange) {
    config.fishingRange = selectedRange;
    logInfo(`Seçilen balık tutma menzili: ${chalk.cyan(config.fishingRange)} (Maliyet: ${config.rangeCosts[config.fishingRange]} enerji)`); 
  }
  return selectedRange;
}

// Noktalar arası interpolasyon
function interpolatePoints(p0, p1, steps) {
  const pts = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(p0[0] + (p1[0] - p0[0]) * t);
    const y = Math.round(p0[1] + (p1[1] - p0[1]) * t);
    pts.push([x, y]);
  }
  return pts;
}

// X pozisyonu hesapla
function calculatePositionX(frame, direction) {
  return 450 + frame * 2 + direction * 5;
}

// Y pozisyonu hesapla
function calculatePositionY(frame, direction) {
  return 426 + frame * 2 - direction * 3;
}

// Geliştirilmiş balık tutma fonksiyonu
async function fish() {
  return new Promise((resolve, reject) => {
    let wsConnection = null;
    let gameStarted = false;
    let gameSuccess = false;
    const keyFrames = [];
    const requiredFrames = 10;
    const interpolationSteps = 30;
    let endSent = false;
    let reconnectAttempt = 0;
    const maxReconnectAttempts = 3;

    const connectWebSocket = () => {
      // Önceki bağlantıyı kapat
      if (wsConnection) {
        try {
          wsConnection.close();
        } catch (err) {
          logDebug(`Önceki WebSocket bağlantısını kapatma hatası: ${err.message}`);
        }
      }

      logDebug(`WebSocket bağlantısı başlatılıyor (Deneme: ${reconnectAttempt + 1}/${maxReconnectAttempts + 1})`);
      wsConnection = new WebSocket(`${config.wsUrl}/?token=${config.authToken}`);

      // Zaman aşımını ayarla
      const timeout = setTimeout(() => {
        logWarn('Balık tutma zaman aşımı - bağlantı kapatılıyor');
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.close();
        }
        
        // Yeniden bağlanma denemesi
        if (reconnectAttempt < maxReconnectAttempts) {
          reconnectAttempt++;
          logInfo(`Yeniden bağlanılıyor (${reconnectAttempt}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, config.wsReconnectDelay);
        } else {
          logError(`Maksimum yeniden bağlanma denemesi aşıldı (${maxReconnectAttempts})`);
          resolve(false);
        }
      }, config.wsTimeout);

      wsConnection.on('open', () => {
        logDebug('WebSocket bağlantısı açıldı');
        wsConnection.send(JSON.stringify({
          cmd: 'prepare',
          range: config.fishingRange,
          is5x: config.is5x
        }));
      });

      wsConnection.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logDebug(`WebSocket mesajı alındı: ${message.type}`);

          if (message.type === 'initGame') {
            gameStarted = true;
            wsConnection.send(JSON.stringify({ cmd: 'start' }));
          }

          if (message.type === 'gameState') {
            const frame = message.frame || 0;
            const direction = message.dir || 0;
            const x = calculatePositionX(frame, direction);
            const y = calculatePositionY(frame, direction);
            let entry = direction !== 0 ? [x, y, frame, direction] : [x, y];
            keyFrames.push(entry);
            logDebug(`Frame eklendi: ${keyFrames.length}/${requiredFrames}`);

            if (keyFrames.length >= requiredFrames && !endSent) {
              let finalFrames = [];
              if (keyFrames.length < 2) {
                finalFrames = keyFrames.slice();
              } else {
                finalFrames.push(keyFrames[0]);
                for (let i = 1; i < keyFrames.length; i++) {
                  const prev = keyFrames[i - 1].slice(0, 2);
                  const curr = keyFrames[i].slice(0, 2);
                  const interpolated = interpolatePoints(prev, curr, interpolationSteps);
                  finalFrames.push(...interpolated);
                  finalFrames.push(keyFrames[i]);
                }
              }

              const endCommand = {
                cmd: 'end',
                rep: {
                  fs: 100,
                  ns: 200,
                  fps: 20,
                  frs: finalFrames
                },
                en: 1
              };
              logDebug('End komutu gönderiliyor');
              wsConnection.send(JSON.stringify(endCommand));
              endSent = true;
            }
          }

          if (message.type === 'gameOver') {
            gameSuccess = message.success;
            clearTimeout(timeout);
            
            if (gameSuccess) {
              const fish = message.catchedFish.fishInfo;
              logSuccess(`${chalk.cyan(fish.fishName)} yakalandı! (kalite: ${fish.quality}) Değer: ${fish.sellPrice} altın ve ${fish.expGain} XP!`); 
              logInfo(`⭐ Mevcut XP: ${message.catchedFish.currentExp}/${message.catchedFish.expToNextLevel}`); 
              logHighlight(`⚡ Kalan Enerji`, `${message.catchedFish.energy}`); 
              log(`💰 Altın: ${message.catchedFish.gold}`); 
              log(`🐟 Balık Puanları: ${message.catchedFish.fishPoint}`); 
              
              // Yakalanan balığı envantere ekle
              if (config.enableAutoSellFish) {
                caughtFishInventory.push({
                  id: fish.id,
                  name: fish.fishName,
                  quality: fish.quality,
                  sellPrice: fish.sellPrice
                });
              }
              
              currentEnergy = message.catchedFish.energy;
              totalFishCaught++;
              fishCaughtSinceLastSell++;
            } else {
              logError('Balık yakalanamadı');
              logHighlight(`⚡ Kalan Enerji`, `${message.catchedFish.energy}`); 
              log(`💰 Altın: ${message.catchedFish.gold}`); 
              log(`🐟 Balık Puanları: ${message.catchedFish.fishPoint}`); 
              
              currentEnergy = message.catchedFish.energy;
            }
            
            wsConnection.close();
            resolve(gameSuccess);
          }
        } catch (parseError) {
          logError(`Mesaj ayrıştırma hatası: ${parseError.message}`); 
          logDebug(`Hatalı mesaj içeriği: ${data.toString()}`);
        }
      });

      wsConnection.on('error', (error) => {
        logError(`WebSocket hatası: ${error.message}`); 
        clearTimeout(timeout);
        
        // Yeniden bağlanma denemesi
        if (reconnectAttempt < maxReconnectAttempts) {
          reconnectAttempt++;
          logInfo(`Yeniden bağlanılıyor (${reconnectAttempt}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, config.wsReconnectDelay);
        } else {
          reject(error);
        }
      });

      wsConnection.on('close', (code, reason) => {
        logDebug(`WebSocket bağlantısı kapandı. Kod: ${code}, Sebep: ${reason || 'Belirtilmedi'}`);
        if (!gameStarted && reconnectAttempt < maxReconnectAttempts) {
          reconnectAttempt++;
          logInfo(`Oyun başlamadan bağlantı kapandı. Yeniden bağlanılıyor (${reconnectAttempt}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, config.wsReconnectDelay);
        } else if (!gameStarted) {
          logError('Balık tutma başlamadan bağlantı kapandı, maksimum deneme sayısına ulaşıldı');
          resolve(false);
        }
        clearTimeout(timeout);
      });
    };

    // İlk bağlantıyı başlat
    connectWebSocket();
  });
}

// Enerji için geri sayım göster
async function showEnergyCountdown() {
  if (!energyRefreshTime) return;
  logWarn('Enerji yetersiz. Enerjinin yenilenmesi bekleniyor...');
  while (new Date() < energyRefreshTime) {
    const timeRemaining = energyRefreshTime - new Date();
    process.stdout.write(`\r Enerji şu süre sonra yenilenecek: ${chalk.cyan(formatTimeRemaining(timeRemaining))}`); 
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n');
  logSuccess('Enerji şimdi yenilenmiş olmalı!');
  energyRefreshTime = null;
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Ana bot döngüsü
async function runBot() {
  logInfo('Fishing Frenzy botu başlatılıyor...');
  
  // İlk envanter kontrolü
  const initialInventoryCheck = await checkInventory();
  if (!initialInventoryCheck) {
    logWarn('İlk envanter kontrolü başarısız oldu, 30 saniye sonra tekrar deneniyor...');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  
  while (true) {
    try {
      const hasEnergy = await checkInventory();

      if (!hasEnergy) {
        await showEnergyCountdown();
        continue;
      }

      selectFishingRange();

      // Balık tutma zamanı geldi mi kontrol et
      logInfo(`🎣 Balık tutma işlemi başlatılıyor: ${chalk.cyan(config.fishingRange)}... (Enerji maliyeti: ${config.rangeCosts[config.fishingRange]})`); 
      const success = await fish();

      if (success) {
        logSuccess(`Balık tutma işlemi başarıyla tamamlandı. ${config.delayBetweenFishing / 1000} saniye bekleniyor...`); 
        
        // Balık satma işlemini kontrol et
        if (config.enableAutoSellFish && fishCaughtSinceLastSell >= config.sellFishInterval) {
          await sellFish();
        }
        
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenFishing));
        retryCount = 0;
      } else {
        retryCount++;
        const waitTime = retryCount > config.maxRetries ? config.retryDelay * 3 : config.retryDelay;
        logWarn(`Balık tutma işlemi başarısız oldu. Deneme ${retryCount}/${config.maxRetries}. ${waitTime / 1000} saniye bekleniyor...`); 
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      logError(`Balık tutma işlemi sırasında hata: ${error.message}`); 
      retryCount++;
      const waitTime = retryCount > config.maxRetries ? 60000 : 10000;
      logWarn(`Hata oluştu. Deneme ${retryCount}/${config.maxRetries}. ${waitTime / 1000} saniye bekleniyor...`); 
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// İşlenmeyen hataları yakala
process.on('uncaughtException', (error) => {
  logError(`İşlenmeyen hata: ${error}`); 
  logWarn('Bot 1 dakika içinde yeniden başlatılacak...');
  setTimeout(() => runBot(), 60000);
});

// Programı başlat
displayBanner(); 
logInfo('------------------------------------------------------');
log(`Kullanılabilir balık tutma menzilleri:`); 
log(`- short_range: ${config.rangeCosts['short_range']} enerji`); 
log(`- mid_range: ${config.rangeCosts['mid_range']} enerji`); 
log(`- long_range: ${config.rangeCosts['long_range']} enerji`); 
log(`Deneme sayısı: ${config.maxRetries}, Balık tutma işlemleri arası gecikme: ${config.delayBetweenFishing}ms`); 
log(`Enerji yenilenme süresi: ${config.energyRefreshHours} saat`); 
logInfo('------------------------------------------------------');
runBot().catch(error => {
  logError(`Bot'ta kritik hata: ${error}`); 
  process.exit(1);
});