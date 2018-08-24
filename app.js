const systems = require('./ei-parse-systems.js');
const eilog = require('./ei-log.js');
const yaml = require('js-yaml');
const fs = require('fs');
const axios = require('axios');

function log(level, s) {
    eilog.log(level, s);
}

log(0, "Parsing systems...");
var eveSystems = systems.getSystems();

log(0, "Parsing types...");
const typeIDs = yaml.safeLoad(fs.readFileSync('./sde/fsd/typeIDs.yaml', 'utf8'));
var tidByGid = {};

log(0, "Building market groups...");
// console.log(Object.keys(typeIDs).length)
for (tidKey of Object.keys(typeIDs)) {
    let o = typeIDs[tidKey];
    // console.log(o)
    if (!o.published) continue;
    let gid = o.groupID;
    if (!tidByGid[gid]) {
        tidByGid[gid] = [tidKey];
    } else {
        tidByGid[gid].push(tidKey);
    }
}

// console.log(tidByGid);
log(0, "Ready");
var sellPrices = []
var buyPrices = []

//
// Helpers
//

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const nameOfType = (typeID) => {
    if (!typeIDs[typeID]) {
        log(3, 'unknown typeID: ' + typeID);
        return null;
    }
    return typeIDs[typeID].name["en"]
}

const formatIsk = (price) => {
    if (price)
        return price.toLocaleString('en-US') + " ISK "
    else
        return 'err';
}

const randomItemKey = (obj) => {
    var keyIdx = Math.floor(Math.random() * Object.keys(obj).length);
    return Object.keys(obj)[keyIdx];
}

const printPrice = (logLevel, title, priceObj) => {
    if (!priceObj) {
        log(logLevel, title + '  unknown');
        return;
    }
    var res = title + formatIsk(priceObj.price);
    res += " in " + priceObj.system;
    res += " (region: " + priceObj.region + ")";
    log(logLevel, res);
}

const calcMargin = (sellPrice, buyPrice) => {
    let ppi = buyPrice - sellPrice
    return Math.round(100 *(100*ppi/buyPrice))/100;
}

const printPriceDetails = (buyObj, sellObj, verbose) => {
    if (!sellObj || !sellObj) {
        logLevel(3, 'error printing price details');
        return;
    }
    let quantity = Math.min(sellObj.details.volume_remain, buyObj.details.volume_remain);
    let ppi = buyObj.price - sellObj.price
    let profit = quantity * (buyObj.price - sellObj.price)
    let volume = typeIDs[buyObj.details.type_id].volume
    let margin = calcMargin(sellObj.price, buyObj.price)
    let ppv = ppi / volume;
    let p = verbose ? '+' : ' '
    let ll = 1;

    if (verbose) {
        log(ll, "    SELL: " + sellObj.request);
        log(ll, "    BUY:  " + buyObj.request);
        log(ll, "    ---------------------  ")
        log(ll, "   | SELL order details  | ")
        log(ll, "    ---------------------  ")
        log(ll, sellObj.details)
        log(ll, "    ---------------------  ")
        log(ll, "   |  BUY order details  | ")
        log(ll, "    ---------------------  ")
        log(ll, buyObj.details)
        log(ll, ' ');
    }
    log(ll,p+' Projected profit: ' + formatIsk(profit))
    log(ll, '            ISK/m3: ' + formatIsk(ppv))
    log(ll, '          ISK/item: ' + formatIsk(ppi))
    log(ll, '            margin: ' + margin + "%")
    log(ll, '          quantity: ' + quantity)
    log(ll, '                m3: ' + quantity * volume)
}


// 
// Main methods
// 

async function startProcess() {

    // for (; ;) {
    //     await sleep(7500);
    //     var typeId = '43807'
    //     var name = nameOfType(typeId);
    //     await doItem(typeId);
    // }

    // marketGroupID: 1033

    for (;;) {
        var typeId = randomItemKey(typeIDs);
        var name = nameOfType(typeId);
        if (!name || name.endsWith("Blueprint")) continue;
        if (name.startsWith("Crates of")) continue;
        if (!typeIDs[typeId].published) continue;
        await doItem(typeId);
    }
    
    
    var gidRanges = [
        [422, 423, "Isotopes"],
        [450, 462, "Ores"],
        [467, 469, "Ores"],
        [1304, 1304, "Generic Decryptor"],
        [1003, 1042, "PI"],
        [738, 751, "Implants"],
        [1003, 1042, "PI"],
        [38, 96, "Ship modules"]
    ];

    for (range of gidRanges) {
        for (var gid = range[0]; gid <= range[1]; gid++) {
            if (tidByGid[gid]) {
                for (typeId of tidByGid[gid]) {
                    var name = nameOfType(typeId);
                    if (!typeIDs[typeId].published) continue;
                    if (!name || name.endsWith("Blueprint")) continue;
                    await doItem(typeId);
                }
            }
        }
    }
    

    // for (; ;) {
    //     await sleep(7500);
    //     var typeId = '27129'
    //     var name = nameOfType(typeId);
    //     await doItem(typeId);
    // }
}
startProcess();

function recursiveSupplyDemandCheck(supply, demand, isSupply) {
    const bestSell = supply[0];
    const bestBuy = demand[0];

    if (bestBuy && bestSell) {
        if (calcMargin(bestSell.price, bestBuy.price) > 2) { // profit margin > 2%
            
            if (isSupply) {
                log(1, '<--- SUPPLY check')
                supply.shift();
            } else {
                log(1, '                     DEMAND check --->');
                demand.shift();
            }

            printPrice(1, '   - best buy:  ', bestBuy);
            printPrice(1, '   - best sell: ', bestSell);
            log(       1, '   - margin: ' + calcMargin(bestSell.price, bestBuy.price) + "%");
            printPriceDetails(bestBuy, bestSell, false);

            recursiveSupplyDemandCheck(supply, demand, isSupply)
        }
    }
}

async function doItem(typeID) {
    var start = Date.now();

    await scanRegionalMarkets(typeID);
    const priceSort = (a, b) => {
        if (a.price < b.price) return -1;
        if (a.price > b.price) return 1;
        return 0;
    }

    

    sellPrices = sellPrices.sort(priceSort);
    buyPrices = buyPrices.sort(priceSort).reverse();

    const bestSell = sellPrices[0];
    const bestBuy = buyPrices[0];

    if (bestBuy && bestSell) {
        if (calcMargin(bestSell.price, bestBuy.price) > 2) { // profit margin > 2%
            log(1, '\n\n\n');
            log(1, ' * Item: ' + nameOfType(typeID) + ' ('+typeID+') ')
            printPrice(1, '   - best buy:  ', bestBuy);
            printPrice(1, '   - best sell: ', bestSell);
            log(       1, '   - margin: ' + calcMargin(bestSell.price, bestBuy.price) + "%");
            printPriceDetails(bestBuy, bestSell, true);

            var supply = sellPrices.slice();
            var demand = buyPrices.slice();
            supply.shift();
            demand.shift();
            recursiveSupplyDemandCheck(supply, demand, true)

            supply = sellPrices.slice();
            demand = buyPrices.slice();
            supply.shift();
            demand.shift();
            recursiveSupplyDemandCheck(supply, demand, false)
        } else {
            log(2, ' * Item: ' + nameOfType(typeID))
            printPrice(2, '   - best buy:  ', bestBuy);
            printPrice(2, '   - best sell: ', bestSell);
            log(       2, '   - margin: ' + calcMargin(bestSell.price, bestBuy.price) + "%");
        }
    }

    var end = Date.now();
    var elapsed = end - start;
    var elapsedSec = parseFloat(Math.round(elapsed / 1000 * 100) / 100).toFixed(2);

    log(2, elapsedSec + ' sec.');
    sellPrices = [];
    buyPrices = [];
}


async function scanRegionalMarkets(typeId) {
    try {
        log(2, "Scanning market for '" + nameOfType(typeId) + "' id: " + typeId);
        // const config = yaml.safeLoad(fs.readFileSync('./custom_data/regions_domain_heimatar.yml', 'utf8'));
        // const config = yaml.safeLoad(fs.readFileSync('./custom_data/regions_all_highsec.yml', 'utf8'));
        const config = yaml.safeLoad(fs.readFileSync('./custom_data/regions_domain_forge.yml', 'utf8'));
        // const config = yaml.safeLoad(fs.readFileSync('./custom_data/regions_all_but_forge_domain.yml', 'utf8'));
        var promises = [];
        for (o of config) {
            promises.push(requestDataForRegion(o.itemID, o.itemName, 'sell', typeId));
            promises.push(requestDataForRegion(o.itemID, o.itemName, 'buy', typeId));
        }
        await Promise.all(promises);
    } catch (e) {
        log(3, 'Error scanning regional market: \n' + e);
    }
}



/// HTTP request method
async function requestDataForRegion(regionId, regionName, type, typeId) {
    const url = 'https://esi.evetech.net/latest/markets/' + regionId + '/orders/?datasource=tranquility&order_type=' + type + '&page=1&type_id=' + typeId;
    var bestPrice = null;

    try {
        const response = await axios(url);

        let result = response.data;
        result.forEach(o => {
            
            // if (eveSystems[o.system_id].security >= 0.45) {
            //     if (type == 'buy') { 
            //         if (eveSystems[o.system_id].name != "Jita") continue
            //     }
            //     else if (type == 'sell') { 
            //         if (eveSystems[o.system_id].name != "Amarr") continue
            //     }
            // }

            // ignore lowsec
            if (eveSystems[o.system_id].security >= 0.45) {
                if (type == 'sell') {
                    if (!bestPrice || bestPrice.price > o.price) {
                        bestPrice = o;
                    }
                } else {
                    if (!bestPrice || bestPrice.price < o.price) {
                        bestPrice = o;
                    }
                }
            }
        });

        if (bestPrice && bestPrice != undefined) {
            const sec = eveSystems[bestPrice.system_id].security;
            const systemName = eveSystems[bestPrice.system_id].name + ' ' + Math.round(sec * 10) / 10;
            var res = "";
            if (type == 'sell') {
                res = "lowest sell price";
                sellPrices.push({
                    price: bestPrice.price,
                    region: regionName,
                    system: systemName,
                    details: bestPrice,
                    request: url
                });
            } else if (type == 'buy') {
                res = "heighest buy price";
                buyPrices.push({
                    price: bestPrice.price,
                    region: regionName,
                    system: systemName,
                    details: bestPrice,
                    request: url
                });
            }
            res += ' in' + regionName;
            res += ": " + formatIsk(bestPrice.price);
            res += " (" + eveSystems[bestPrice.system_id].name + ")";
            res += " ss: " + sec;
        } else {
            // console.log("error: " + url);
            // console.log("no " + type + " orders in " + regionName);
        }
    } catch (e) {
        log(3, "HTTP request failed for " + url + ": \n" + e);
    }
}
