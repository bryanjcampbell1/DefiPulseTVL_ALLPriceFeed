const { PriceFeedInterface } = require("./PriceFeedInterface");
const { parseFixed } = require("@ethersproject/bignumber");

// An implementation of PriceFeedInterface that uses DefiPulse Data api to retrieve prices.
class DefiPulseTVL_ALLPriceFeed extends PriceFeedInterface {
  /**
   * @notice Constructs the CryptoWatchPriceFeed.
   * @param {Object} logger Winston module used to send logs.
   * @param {Object} web3 Provider from truffle instance to connect to Ethereum network.
   * @param {String} apiKey DeFiPulse Data API key. Note: these API keys are rate-limited.
   * @param {Integer} lookback How far in the past the historical prices will be available using getHistoricalPrice.
   * @param {Object} networker Used to send the API requests. 
   * @param {Function} getTime Returns the current time.
   * @param {Integer} minTimeBetweenUpdates Min number of seconds between updates. If update() is called again before
   *      this number of seconds has passed, it will be a no-op.
   */
  constructor(
    logger,
    web3,
    apiKey,
    lookback,
    networker,
    getTime,
    minTimeBetweenUpdates,
    decimals = 18,

  ) {
    super();
    this.logger = logger;
    this.web3 = web3;

    this.apiKey = apiKey;

    this.lookback = lookback;
    this.networker = networker;
    this.getTime = getTime;
    this.minTimeBetweenUpdates = minTimeBetweenUpdates;

    this.toBN = this.web3.utils.toBN;

    this.historicalPrices = [{timestamp:0, value:0}];

    this.convertDecimals = number => {
      // Converts price result to wei
      // returns price conversion to correct decimals as a big number
      return this.toBN(parseFixed(number.toString(), decimals).toString());
    };

    this.removeValuesOlderThanLookback = () => {

        const currentTime = this.getTime();

        this.historicalPrices = this.historicalPrices.filter(priceObj => priceObj.timestamp > (currentTime - lookback) );

    }


  }

  getCurrentPrice() {
    return this.currentPrice;
  }

  getHistoricalPrice(time, verbose = false) {
    if (this.lastUpdateTime === undefined) {
      return undefined;
    }

    let closestTime = {timestamp:0, value:0};

    //go through all values and find time that that is the largest and still less than 'time'
    for(let i = 0; i < this.historicalPrices.length; i++){

      let past = this.historicalPrices[i].timestamp;
      let val = this.historicalPrices[i].value;

      if( (past > closestTime.timestamp) && (past < time)){

        closestTime.timestamp = past;
        closestTime.value = val;

      }

    }

    const returnPrice = closestTime.value;


    return returnPrice;
  }


  getLastUpdateTime() {
    return this.lastUpdateTime;
  }

  async update() {
    const currentTime = this.getTime();

    // Return early if the last call was too recent.
    if (this.lastUpdateTime !== undefined && this.lastUpdateTime + this.minTimeBetweenUpdates > currentTime) {
      this.logger.debug({
        at: "DefiPulseTVL_ALLPriceFeed",
        message: "Update skipped because the last one was too recent",
        currentTime: currentTime,
        lastUpdateTimestamp: this.lastUpdateTime,
        timeRemainingUntilUpdate: this.lastUpdateTimes + this.minTimeBetweenUpdates - currentTime
      });
      return;
    }

    this.logger.debug({
      at: "DefiPulseTVL_ALLPriceFeed",
      message: "Updating",
      currentTime: currentTime,
      lastUpdateTimestamp: this.lastUpdateTime
    });

    // 1. Construct URLs.
    // See https://docs.cryptowat.ch/rest-api/markets/price for how this url is constructed.
    const priceUrl =
    `https://data-api.defipulse.com/api/v1/defipulse/api/MarketData?api-key=${this.apiKey}`;

    // See https://docs.cryptowat.ch/rest-api/markets/ohlc for how this url is constructed.

    // 2. Send requests.
    const [priceResponse] = await Promise.all([
      this.networker.getJson(priceUrl)
    ]);

    // 3. Check responses.
    if (!priceResponse  || !priceResponse.data.All.total) {
      throw new Error(`🚨Could not parse price result from url ${priceUrl}: ${JSON.stringify(priceResponse)}`);
    }

    // 4. Parse results.
    // Return data structure:
    // {
    //   data: {
    //            "All": {
    //                     "total": priceValue,

    //                       ...

    //                     }
    //            }
    //       
    // }


    const newPrice = this.convertDecimals( ( priceResponse.data.result.All.total / 1000000000 ).toFixed(6) );

    // 5. Store results.
    this.currentPrice = newPrice;
    this.lastUpdateTime = currentTime;
    this.historicalPrices.push({timestamp:currentTime, value:newPrice });
    this.removeValuesOlderThanLookback();

  }

}






module.exports = {
  DefiPulseTVL_ALLPriceFeed
};