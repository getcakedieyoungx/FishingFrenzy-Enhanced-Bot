# 🎣 Fishing Frenzy Enhanced Bot v2.0.0

## 🚀 Features

- ✨ Multi-Account Support (Manage multiple accounts simultaneously)
- 🎯 Automatic fishing
- 💰 Automatic fish selling
- 🎁 Automatic daily reward claiming
- ⚡ Smart energy management
- 📊 Detailed statistics
- 🔄 Automatic reconnection
- 🌈 Colorful console output

## 📋 Requirements

- Node.js (v14 or higher)
- npm or yarn

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/getcakedieyoungx/FishingFrenzy-Enhanced-Bot.git
```

2. Install required packages:
```bash
npm install
# or
yarn install
```

3. Edit the `config.json` file.

## ⚙️ Configuration

The bot now supports multiple accounts. The `config.json` file has the following structure:

```json
{
  "global": {
    "apiBaseUrl": "https://api.fishingfrenzy.co",
    "wsUrl": "wss://ws.fishingfrenzy.co",
    "wsTimeout": 30000,
    "wsReconnectDelay": 5000,
    "maxRetries": 3,
    "retryDelay": 5000,
    "energyRefreshHours": 24,
    "logLevel": "info",
    "rangeCosts": {
      "short_range": 1,
      "mid_range": 2,
      "long_range": 3
    }
  },
  "accounts": [
    {
      "enabled": true,
      "token": "ACCOUNT_1_TOKEN",
      "fishingRange": "short_range",
      "is5x": false,
      "delayBetweenFishing": 3000,
      "enableDailyClaim": true,
      "enableAutoSellFish": true,
      "minFishQualityToKeep": 4,
      "sellFishInterval": 10,
      "retryOnError": true,
      "maxRetries": 3,
      "retryDelay": 5000
    },
    {
      "enabled": false,
      "token": "ACCOUNT_2_TOKEN",
      "fishingRange": "short_range",
      "is5x": false,
      "delayBetweenFishing": 3000,
      "enableDailyClaim": true,
      "enableAutoSellFish": true,
      "minFishQualityToKeep": 4,
      "sellFishInterval": 10,
      "retryOnError": true,
      "maxRetries": 3,
      "retryDelay": 5000
    }
  ]
}
```

### 🔑 Getting Tokens

1. Log in to [FishingFrenzy.co](https://fishingfrenzy.co)
2. Open your browser's developer tools (F12)
3. Go to the Network tab
4. Find any API request
5. Look for the "Authorization" header in the request
6. Copy the value after "Bearer "
7. Paste this value into the "token" field for the respective account in config.json

### ⚙️ Account Settings

You can customize the following settings for each account:

- `enabled`: Whether the account is active (true/false)
- `token`: Account authentication token
- `fishingRange`: Fishing range (short_range, mid_range, long_range)
- `is5x`: Is 5x bonus active? (true/false)
- `delayBetweenFishing`: Delay between fishing operations (ms)
- `enableDailyClaim`: Auto-claim daily rewards? (true/false)
- `enableAutoSellFish`: Enable automatic fish selling? (true/false)
- `minFishQualityToKeep`: Minimum fish quality to keep
- `sellFishInterval`: After how many fish should selling occur?
- `retryOnError`: Retry on error? (true/false)
- `maxRetries`: Maximum number of retries
- `retryDelay`: Delay between retries (ms)

### 🌐 Global Settings

The global settings affect all accounts:

- `apiBaseUrl`: API endpoint URL
- `wsUrl`: WebSocket server URL
- `wsTimeout`: WebSocket connection timeout (ms)
- `wsReconnectDelay`: Delay before reconnecting (ms)
- `maxRetries`: Maximum number of retries for operations
- `retryDelay`: Delay between retries (ms)
- `energyRefreshHours`: Hours until energy refreshes
- `logLevel`: Logging detail level (debug/info/warn/error)
- `rangeCosts`: Energy cost for each fishing range

## 🚀 Usage

To start the bot:

```bash
node index.js
```

The bot will display a banner showing:
- Number of active accounts
- Available fishing ranges
- Energy costs for each range

Each account will run independently with its own:
- Inventory management
- Energy tracking
- Fish selling
- Daily reward claiming
- Error handling and retries

## 📝 Notes

- Each account requires a separate token
- Never share your tokens with anyone
- Regularly refresh your tokens for account security
- Adding too many accounts may result in IP restrictions
- The bot handles each account in parallel but with slight delays to prevent rate limiting
- Console output is color-coded for better readability
- Each account's actions are prefixed with its index number for easy tracking

## 🔧 Troubleshooting

If you see "401 Unauthorized" errors:
1. Check if your tokens are valid
2. Get new tokens following the token acquisition steps
3. Update the tokens in config.json
4. Restart the bot

If you see rate limiting errors:
1. Increase the `delayBetweenFishing` value
2. Reduce the number of active accounts
3. Use different IPs for different accounts

## 🆕 Updates

The bot now features:
- Improved error handling for each account
- Independent state management per account
- Parallel account processing
- Configurable delays between actions
- Enhanced logging with account identification
- Automatic recovery from connection issues

## 🤝 Contributing

Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Share improvements

## ⚖️ License

This project is licensed under the MIT License.