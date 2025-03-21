# 🎣 Fishing Frenzy Geliştirilmiş Bot

Fishing Frenzy için geliştirilmiş özelliklere sahip otomatik balık tutma botu. Günlük ödül toplama, otomatik balık satma ve daha fazla özellik içerir.

## ✨ Özellikler

- **Enerji Tabanlı Balık Tutma**: Mevcut enerjiye göre otomatik olarak balık tutma menzili seçimi
- **Günlük Ödül Toplama**: Günlük ödülleri otomatik olarak toplama
- **Otomatik Balık Satma**: Düşük kaliteli balıkları otomatik olarak satma, yüksek kaliteli balıkları saklama
- **7/24 Çalışma**: Sürekli balık tutma ve otomatik yeniden deneme sistemi
- **Enerji Takibi**: Enerji seviyelerini izler ve tükendiğinde yenilenmeyi bekler
- **Detaylı Loglama**: Renkli durum güncellemeleri ile kapsamlı konsol logları
- **Hata Yönetimi**: Güçlü hata kurtarma ve bağlantı yönetimi
- **WebSocket Yeniden Bağlanma**: Bağlantı kesilirse otomatik olarak yeniden bağlanma
- **Yapılandırılabilir Ayarlar**: Kendi ihtiyaçlarınıza göre özelleştirilebilir

## 📋 Gereksinimler

- Node.js (v14 veya daha yüksek)
- Geçerli Fishing Frenzy kimlik doğrulama tokeni

## 🚀 Kurulum

1. Depoyu klonlayın:
```bash
git clone https://github.com/getcakedieyoungx/FishingFrenzy-Enhanced-Bot.git
cd FishingFrenzy-Enhanced-Bot
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. Kök dizinde bir `token.txt` dosyası oluşturun ve Fishing Frenzy kimlik doğrulama tokeninizi yapıştırın:
```bash
echo "TOKEN_BURAYA" > token.txt
```

## 💻 Kullanım

Botu başlatın:
```bash
npm start
```

## ⚙️ Yapılandırma

`index.js` dosyasında aşağıdaki yapılandırma değişkenlerini değiştirerek botun davranışını özelleştirebilirsiniz:

```javascript
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
```

## 📊 Enerji Yönetimi

Bot, mevcut enerjinize göre balık tutma menzillerini akıllıca seçer:
- `short_range`: 1 enerji maliyeti
- `mid_range`: 2 enerji maliyeti
- `long_range`: 3 enerji maliyeti

Enerji tükendiğinde, bot enerji yenilenme süresini bekleyecektir (varsayılan: 24 saat).

## 🎁 Günlük Ödül Toplama

Bot otomatik olarak günlük ödüllerinizi kontrol eder ve alınabilir durumdaysa toplar. Bu özelliği `enableDailyClaim` ayarıyla etkinleştirebilir veya devre dışı bırakabilirsiniz.

## 🐟 Otomatik Balık Satma

Bot, belirtilen kalite eşiğinin altındaki balıkları otomatik olarak satabilir. Yüksek kaliteli balıkları saklamak ve düşük kaliteli balıkları satmak için `minFishQualityToKeep` ayarını kullanabilirsiniz.

## 🔄 WebSocket Yeniden Bağlanma

Bot, WebSocket bağlantısında herhangi bir kesinti olursa otomatik olarak yeniden bağlanmaya çalışır. Bağlantı denemelerinin sayısını ve gecikme süresini `maxReconnectAttempts` ve `wsReconnectDelay` ayarlarıyla yapılandırabilirsiniz.

## 🔒 Kimlik Doğrulama

Kimlik doğrulama tokeninizi almanın yolu:
1. [Fishing Frenzy](https://fishingfrenzy.co/) sitesine giriş yapın
2. Tarayıcı geliştirici araçlarını açın (F12)
3. Uygulama sekmesine gidin → Yerel Depolama → fishingfrenzy.co
4. Token değerini kopyalayın (tırnak işaretleri olmadan)
5. Bunu `token.txt` dosyanıza yapıştırın

## ⚠️ Sorumluluk Reddi

Bu bot yalnızca eğitim amaçlı olarak sağlanmaktadır. Otomatik komut dosyalarının kullanımı, Fishing Frenzy'nin hizmet şartlarını ihlal edebilir. Kendi sorumluluğunuzda kullanın.

## 📜 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır - ayrıntılar için LICENSE dosyasına bakın.

## 🤝 Katkıda Bulunma

Katkılar memnuniyetle karşılanır! Lütfen bir Pull Request göndermekten çekinmeyin.

## 📧 İletişim

Sorular veya destek için lütfen GitHub deposunda bir konu açın.