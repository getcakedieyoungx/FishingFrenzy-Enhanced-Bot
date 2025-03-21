const axios = require('axios');
const WebSocket = require('ws');
const chalk = require('chalk');
const fs = require('fs');

// Yapılandırma dosyasını oku
let config;
try {
  config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
} catch (error) {
  console.error('Yapılandırma dosyası okunamadı:', error.message);
  process.exit(1);
}

// Her hesap için durum değişkenleri
const accountStates = new Map();

// Hesap durumu sınıfı
class AccountState {
  constructor(accountConfig) {
    this.config = { ...config.global, ...accountConfig };
    this.currentEnergy = 0;
    this.retryCount = 0;
    this.energyRefreshTime = null;
    this.fishCaughtSinceLastSell = 0;
    this.totalFishCaught = 0;
    this.dailyRewardClaimed = false;
    this.caughtFishInventory = [];
    this.lastDailyClaimCheck = null;
    this.headers = {
      'accept': 'application/json',
      'accept-language': 'en-US,en;q=0.6',
      'authorization': `Bearer ${accountConfig.token}`,
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
  }
}

// Log fonksiyonları
const log = (accountIndex, msg) => console.log(`[Hesap ${accountIndex + 1}] ${msg}`);
const logSuccess = (accountIndex, msg) => console.log(chalk.green(`[Hesap ${accountIndex + 1}] ${msg}`));
const logInfo = (accountIndex, msg) => console.log(`[Hesap ${accountIndex + 1}] ${msg}`);
const logWarn = (accountIndex, msg) => console.log(chalk.yellow(`[Hesap ${accountIndex + 1}] ${msg}`));
const logError = (accountIndex, msg) => console.log(chalk.red(`[Hesap ${accountIndex + 1}] ${msg}`));
const logHighlight = (accountIndex, label, value) => console.log(`[Hesap ${accountIndex + 1}] ${label}: ${chalk.cyan(value)}`);
const logDebug = (accountIndex, msg) => {
  if (config.global.logLevel === 'debug') {
    console.log(chalk.gray(`[Hesap ${accountIndex + 1}] [DEBUG] ${msg}`));
  }
};

// Banner göster
function displayBanner() {
  const banner = [
    chalk.cyan('=================================================='),
    chalk.cyan('    Fishing Frenzy Geliştirilmiş Bot v2.0.0     '),
    chalk.cyan('=================================================='),
    chalk.yellow('  Multi-Account Desteği: ') + chalk.green('Aktif'),
    chalk.yellow('  Aktif Hesap Sayısı: ') + chalk.green(config.accounts.filter(acc => acc.enabled).length),
    chalk.cyan('==================================================')
  ];
  banner.forEach(line => console.log(line));
}

// Profil bilgilerini göster
function displayProfileInfo(accountIndex, data) {
  logSuccess(accountIndex, 'Profil Başarıyla Yüklendi!');
  logInfo(accountIndex, ` Kullanıcı ID: ${data.userId || 'N/A'}`);
  log(accountIndex, ` Altın: ${data.gold || 0}`);
  logHighlight(accountIndex, ' Enerji', `${data.energy || 0}`);
  log(accountIndex, ` Balık Puanları: ${data.fishPoint || 0}`);
  log(accountIndex, ` Tecrübe: ${data.exp || 0}`);
  
  if (data.level) {
    log(accountIndex, ` Seviye: ${data.level}`);
  }
  
  if (data.expToNextLevel) {
    const expProgress = ((data.exp % data.expToNextLevel) / data.expToNextLevel * 100).toFixed(2);
    log(accountIndex, ` Sonraki seviyeye ilerleme: %${expProgress}`);
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
async function checkInventory(accountIndex) {
  const state = accountStates.get(accountIndex);
  try {
    const response = await axios.get(`${state.config.apiBaseUrl}/v1/inventory`, { headers: state.headers });
    state.currentEnergy = response.data.energy || 0;
    displayProfileInfo(accountIndex, response.data);

    // Günlük takvimdeki günü kontrol et
    if (state.config.enableDailyClaim && !state.dailyRewardClaimed) {
      const now = new Date();
      if (!state.lastDailyClaimCheck || (now - state.lastDailyClaimCheck) > (1000 * 60 * 60)) {
        await checkAndClaimDailyReward(accountIndex);
        state.lastDailyClaimCheck = now;
      }
    }

    if (state.currentEnergy > 0) {
      return true;
    } else {
      if (!state.energyRefreshTime) {
        state.energyRefreshTime = new Date();
        state.energyRefreshTime.setHours(state.energyRefreshTime.getHours() + state.config.energyRefreshHours);
      }
      return false;
    }
  } catch (error) {
    logError(accountIndex, `Envanter kontrolü başarısız: ${error.message}`);
    if (error.response && error.response.status === 503) {
      logWarn(accountIndex, 'Sunucu geçici olarak kullanılamıyor, tekrar denemeden önce bekleniyor...');
    }
    return false;
  }
}

// Günlük ödül kontrolü ve toplama
async function checkAndClaimDailyReward(accountIndex) {
  const state = accountStates.get(accountIndex);
  try {
    logInfo(accountIndex, 'Günlük ödül kontrol ediliyor...');
    
    const checkResponse = await axios.get(`${state.config.apiBaseUrl}/v1/daily-rewards/status`, { headers: state.headers });
    
    if (checkResponse.data && checkResponse.data.canClaim) {
      logInfo(accountIndex, 'Günlük ödül almaya hak kazandınız! Toplanıyor...');
      
      const claimResponse = await axios.post(`${state.config.apiBaseUrl}/v1/daily-rewards/claim`, {}, { headers: state.headers });
      
      if (claimResponse.data && claimResponse.data.success) {
        logSuccess(accountIndex, 'Günlük ödül başarıyla toplandı!');
        
        if (claimResponse.data.rewards && claimResponse.data.rewards.length > 0) {
          logInfo(accountIndex, 'Alınan ödüller:');
          claimResponse.data.rewards.forEach(reward => {
            let rewardText = `- ${reward.quantity}x ${reward.name}`;
            if (reward.type === 'Gold') {
              rewardText = chalk.yellow(rewardText);
            } else if (reward.type === 'Item') {
              rewardText = chalk.blue(rewardText);
            }
            log(accountIndex, rewardText);
          });
        }
        
        state.dailyRewardClaimed = true;
        return true;
      }
    } else {
      logInfo(accountIndex, 'Şu anda alınabilecek günlük ödül yok.');
      if (checkResponse.data && checkResponse.data.nextResetTime) {
        const nextReset = new Date(checkResponse.data.nextResetTime);
        const timeUntilReset = nextReset - new Date();
        logInfo(accountIndex, `Bir sonraki ödül: ${formatTimeRemaining(timeUntilReset)}`);
      }
    }
  } catch (error) {
    logError(accountIndex, `Günlük ödül kontrolü sırasında hata: ${error.message}`);
    if (error.response) {
      logDebug(accountIndex, `Hata detayı: ${JSON.stringify(error.response.data)}`);
    }
  }
  
  return false;
}

// Balıkları sat
async function sellFish(accountIndex) {
  const state = accountStates.get(accountIndex);
  if (!state.config.enableAutoSellFish || state.caughtFishInventory.length === 0) {
    return false;
  }
  
  try {
    logInfo(accountIndex, 'Balıklar satılıyor...');
    
    const fishesToSell = state.caughtFishInventory.filter(fish => 
      fish.quality < state.config.minFishQualityToKeep
    );
    
    if (fishesToSell.length === 0) {
      logInfo(accountIndex, 'Satılacak balık yok. Tüm balıklar minimum kalite eşiğinin üzerinde.');
      return false;
    }
    
    const fishIds = fishesToSell.map(fish => fish.id);
    
    const response = await axios.post(`${state.config.apiBaseUrl}/v1/inventory/sell-fish`, {
      fishIds: fishIds
    }, { headers: state.headers });
    
    if (response.data && response.data.success) {
      const totalGold = fishesToSell.reduce((total, fish) => total + (fish.sellPrice || 0), 0);
      logSuccess(accountIndex, `${fishesToSell.length} balık başarıyla satıldı! +${totalGold} altın kazanıldı.`);
      
      state.caughtFishInventory = state.caughtFishInventory.filter(fish => 
        fish.quality >= state.config.minFishQualityToKeep
      );
      
      state.fishCaughtSinceLastSell = 0;
      return true;
    }
  } catch (error) {
    logError(accountIndex, `Balık satışı sırasında hata: ${error.message}`);
    if (error.response) {
      logDebug(accountIndex, `Hata detayı: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// Balık tutma menzilini seç
function selectFishingRange(accountIndex) {
  const state = accountStates.get(accountIndex);
  const availableRanges = [];
  if (state.currentEnergy >= state.config.rangeCosts['long_range']) {
    availableRanges.push('long_range');
  }
  if (state.currentEnergy >= state.config.rangeCosts['mid_range']) {
    availableRanges.push('mid_range');
  }
  if (state.currentEnergy >= state.config.rangeCosts['short_range']) {
    availableRanges.push('short_range');
  }
  if (availableRanges.length === 0) {
    logWarn(accountIndex, "Mevcut enerji ile kullanılabilecek balık tutma menzili yok!");
    return 'short_range';
  }
  const selectedRange = availableRanges[Math.floor(Math.random() * availableRanges.length)];
  if (state.config.fishingRange !== selectedRange) {
    state.config.fishingRange = selectedRange;
    logInfo(accountIndex, `Seçilen balık tutma menzili: ${chalk.cyan(selectedRange)} (Maliyet: ${state.config.rangeCosts[selectedRange]} enerji)`);
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
async function fish(accountIndex) {
  const state = accountStates.get(accountIndex);
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
      if (wsConnection) {
        try {
          wsConnection.close();
        } catch (err) {
          logDebug(accountIndex, `Önceki WebSocket bağlantısını kapatma hatası: ${err.message}`);
        }
      }

      logDebug(accountIndex, `WebSocket bağlantısı başlatılıyor (Deneme: ${reconnectAttempt + 1}/${maxReconnectAttempts + 1})`);
      wsConnection = new WebSocket(`${state.config.wsUrl}/?token=${state.config.token}`);

      const timeout = setTimeout(() => {
        logWarn(accountIndex, 'Balık tutma zaman aşımı - bağlantı kapatılıyor');
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.close();
        }
        
        if (reconnectAttempt < maxReconnectAttempts) {
          reconnectAttempt++;
          logInfo(accountIndex, `Yeniden bağlanılıyor (${reconnectAttempt}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, state.config.wsReconnectDelay);
        } else {
          logError(accountIndex, `Maksimum yeniden bağlanma denemesi aşıldı (${maxReconnectAttempts})`);
          resolve(false);
        }
      }, state.config.wsTimeout);

      wsConnection.on('open', () => {
        logDebug(accountIndex, 'WebSocket bağlantısı açıldı');
        wsConnection.send(JSON.stringify({
          cmd: 'prepare',
          range: state.config.fishingRange,
          is5x: state.config.is5x
        }));
      });

      wsConnection.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logDebug(accountIndex, `WebSocket mesajı alındı: ${message.type}`);

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
            logDebug(accountIndex, `Frame eklendi: ${keyFrames.length}/${requiredFrames}`);

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
              logDebug(accountIndex, 'End komutu gönderiliyor');
              wsConnection.send(JSON.stringify(endCommand));
              endSent = true;
            }
          }

          if (message.type === 'gameOver') {
            gameSuccess = message.success;
            clearTimeout(timeout);
            
            if (gameSuccess) {
              const fish = message.catchedFish.fishInfo;
              logSuccess(accountIndex, `${chalk.cyan(fish.fishName)} yakalandı! (kalite: ${fish.quality}) Değer: ${fish.sellPrice} altın ve ${fish.expGain} XP!`);
              logInfo(accountIndex, `⭐ Mevcut XP: ${message.catchedFish.currentExp}/${message.catchedFish.expToNextLevel}`);
              logHighlight(accountIndex, `⚡ Kalan Enerji`, `${message.catchedFish.energy}`);
              log(accountIndex, `💰 Altın: ${message.catchedFish.gold}`);
              log(accountIndex, `🐟 Balık Puanları: ${message.catchedFish.fishPoint}`);
              
              if (state.config.enableAutoSellFish) {
                state.caughtFishInventory.push({
                  id: fish.id,
                  name: fish.fishName,
                  quality: fish.quality,
                  sellPrice: fish.sellPrice
                });
              }
              
              state.currentEnergy = message.catchedFish.energy;
              state.totalFishCaught++;
              state.fishCaughtSinceLastSell++;
            } else {
              logError(accountIndex, 'Balık yakalanamadı');
              logHighlight(accountIndex, `⚡ Kalan Enerji`, `${message.catchedFish.energy}`);
              log(accountIndex, `💰 Altın: ${message.catchedFish.gold}`);
              log(accountIndex, `🐟 Balık Puanları: ${message.catchedFish.fishPoint}`);
              
              state.currentEnergy = message.catchedFish.energy;
            }
            
            wsConnection.close();
            resolve(gameSuccess);
          }
        } catch (parseError) {
          logError(accountIndex, `Mesaj ayrıştırma hatası: ${parseError.message}`);
          logDebug(accountIndex, `Hatalı mesaj içeriği: ${data.toString()}`);
        }
      });

      wsConnection.on('error', (error) => {
        logError(accountIndex, `WebSocket hatası: ${error.message}`);
        clearTimeout(timeout);
        
        if (reconnectAttempt < maxReconnectAttempts) {
          reconnectAttempt++;
          logInfo(accountIndex, `Yeniden bağlanılıyor (${reconnectAttempt}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, state.config.wsReconnectDelay);
        } else {
          reject(error);
        }
      });

      wsConnection.on('close', (code, reason) => {
        logDebug(accountIndex, `WebSocket bağlantısı kapandı. Kod: ${code}, Sebep: ${reason || 'Belirtilmedi'}`);
        if (!gameStarted && reconnectAttempt < maxReconnectAttempts) {
          reconnectAttempt++;
          logInfo(accountIndex, `Oyun başlamadan bağlantı kapandı. Yeniden bağlanılıyor (${reconnectAttempt}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, state.config.wsReconnectDelay);
        } else if (!gameStarted) {
          logError(accountIndex, 'Balık tutma başlamadan bağlantı kapandı, maksimum deneme sayısına ulaşıldı');
          resolve(false);
        }
        clearTimeout(timeout);
      });
    };

    connectWebSocket();
  });
}

// Enerji için geri sayım göster
async function showEnergyCountdown(accountIndex) {
  const state = accountStates.get(accountIndex);
  if (!state.energyRefreshTime) return;
  logWarn(accountIndex, 'Enerji yetersiz. Enerjinin yenilenmesi bekleniyor...');
  while (new Date() < state.energyRefreshTime) {
    const timeRemaining = state.energyRefreshTime - new Date();
    process.stdout.write(`\r[Hesap ${accountIndex + 1}] Enerji şu süre sonra yenilenecek: ${chalk.cyan(formatTimeRemaining(timeRemaining))}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n');
  logSuccess(accountIndex, 'Enerji şimdi yenilenmiş olmalı!');
  state.energyRefreshTime = null;
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Hesap için bot döngüsü
async function runAccountBot(accountIndex) {
  const state = accountStates.get(accountIndex);
  logInfo(accountIndex, 'Bot başlatılıyor...');
  
  const initialInventoryCheck = await checkInventory(accountIndex);
  if (!initialInventoryCheck) {
    logWarn(accountIndex, 'İlk envanter kontrolü başarısız oldu, 30 saniye sonra tekrar deneniyor...');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  
  while (true) {
    try {
      const hasEnergy = await checkInventory(accountIndex);

      if (!hasEnergy) {
        await showEnergyCountdown(accountIndex);
        continue;
      }

      selectFishingRange(accountIndex);

      logInfo(accountIndex, `🎣 Balık tutma işlemi başlatılıyor: ${chalk.cyan(state.config.fishingRange)}... (Enerji maliyeti: ${state.config.rangeCosts[state.config.fishingRange]})`);
      const success = await fish(accountIndex);

      if (success) {
        logSuccess(accountIndex, `Balık tutma işlemi başarıyla tamamlandı. ${state.config.delayBetweenFishing / 1000} saniye bekleniyor...`);
        
        if (state.config.enableAutoSellFish && state.fishCaughtSinceLastSell >= state.config.sellFishInterval) {
          await sellFish(accountIndex);
        }
        
        await new Promise(resolve => setTimeout(resolve, state.config.delayBetweenFishing));
        state.retryCount = 0;
      } else {
        state.retryCount++;
        const waitTime = state.retryCount > state.config.maxRetries ? state.config.retryDelay * 3 : state.config.retryDelay;
        logWarn(accountIndex, `Balık tutma işlemi başarısız oldu. Deneme ${state.retryCount}/${state.config.maxRetries}. ${waitTime / 1000} saniye bekleniyor...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    } catch (error) {
      logError(accountIndex, `Balık tutma işlemi sırasında hata: ${error.message}`);
      state.retryCount++;
      const waitTime = state.retryCount > state.config.maxRetries ? 60000 : 10000;
      logWarn(accountIndex, `Hata oluştu. Deneme ${state.retryCount}/${state.config.maxRetries}. ${waitTime / 1000} saniye bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Ana bot başlatma fonksiyonu
async function startBot() {
  displayBanner();
  logInfo(-1, '------------------------------------------------------');
  log(-1, 'Kullanılabilir balık tutma menzilleri:');
  log(-1, `- short_range: ${config.global.rangeCosts['short_range']} enerji`);
  log(-1, `- mid_range: ${config.global.rangeCosts['mid_range']} enerji`);
  log(-1, `- long_range: ${config.global.rangeCosts['long_range']} enerji`);
  logInfo(-1, '------------------------------------------------------');

  // Her hesap için durum oluştur
  config.accounts.forEach((account, index) => {
    if (account.enabled) {
      accountStates.set(index, new AccountState(account));
    }
  });

  // Her aktif hesap için bot başlat
  const activeAccounts = config.accounts.filter(acc => acc.enabled);
  for (let i = 0; i < activeAccounts.length; i++) {
    const accountIndex = i;
    runAccountBot(accountIndex).catch(error => {
      logError(accountIndex, `Bot'ta kritik hata: ${error}`);
    });
    // Hesaplar arası kısa bir gecikme ekle
    if (i < activeAccounts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// İşlenmeyen hataları yakala
process.on('uncaughtException', (error) => {
  logError(-1, `İşlenmeyen hata: ${error}`);
  logWarn(-1, 'Bot 1 dakika içinde yeniden başlatılacak...');
  setTimeout(() => startBot(), 60000);
});

// Botu başlat
startBot();