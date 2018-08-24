
const systems = require('./ei-parse-systems.js');
const eilog = require('./ei-log.js');
const output = require('./ei-output.js');
const yaml = require('js-yaml');
const fs = require('fs');
const axios = require('axios');

let dev = true;

function log(level, s) {
    eilog.log(level, s);
}

log(0, "Parsing systems...");
var eveSystems = dev ? systems.getDevSystems() : systems.getSystems();

log(0, "Parsing types...");

let typeIDFile = dev ? './custom_data/typeID_pyroxeres.yml' : './sde/fsd/typeIDs.yaml';
const typeIDs = yaml.safeLoad(fs.readFileSync(typeIDFile, 'utf8'));
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
var sellOrders = []
var buyOrders = []

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

const randomItemKey = (obj) => {
    var keyIdx = Math.floor(Math.random() * Object.keys(obj).length);
    return Object.keys(obj)[keyIdx];
}

// 
// Main methods
// 

async function startProcess() {

    if (dev) {
        var typeId = '1224'
        var name = nameOfType(typeId);
        await doItem(typeId);
        return;
    }

    // for (;;) {
    //     var typeId = randomItemKey(typeIDs);
    //     var name = nameOfType(typeId);
    //     if (!name || name.endsWith("Blueprint")) continue;
    //     if (name.startsWith("Crates of")) continue;
    //     if (!typeIDs[typeId].published) continue;
    //     await doItem(typeId);
    // }
    
    
    var gidRanges = [
        [422, 438, "Isotopes"],
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
    const sell = supply[0];
    const buy = demand[0];

    if (buy && sell) {
        if (output.calcMargin(sell.bestPrice, buy.bestPrice) > 2) { // profit margin > 2%
            if (isSupply) {
                log(1, '<--- SUPPLY check')
                supply.shift();
            } else {
                log(1, '                     DEMAND check --->');
                demand.shift();
            }

            output.printPrice(1, '   - best buy:  ', buy);
            output.printPrice(1, '   - best sell: ', sell);
            log(       1, '   - margin: ' + output.calcMargin(sell.bestPrice, buy.bestPrice) + "%");
            printPriceDetails(buy, sell, false, typeIDs);

            recursiveSupplyDemandCheck(supply, demand, isSupply)
        }
    }
}

async function doItem(typeID) {
    var start = Date.now();

    await scanRegionalMarkets(typeID);    

    const priceSort = (a, b) => {
        if (a.bestPrice < b.bestPrice) return -1;
        if (a.bestPrice > b.bestPrice) return 1;
        return 0;
    }

    sellOrders = sellOrders.sort(priceSort);
    buyOrders = buyOrders.sort(priceSort).reverse();

    const sell = sellOrders[0];
    const buy = buyOrders[0];

    if (buy && sell) {
        // profit margin > 2%
        if (dev || output.calcMargin(sell.bestPrice, buy.bestPrice) > 2) { 
            log(1, '\n\n\n');
            log(1, ' * Item: ' + nameOfType(typeID) + ' ('+typeID+') ')
            output.printPrice(1, '   - best buy:  ', buy);
            output.printPrice(1, '   - best sell: ', sell);
            log(       1, '   - margin: ' + output.calcMargin(sell.bestPrice, buy.bestPrice) + "%");
            output.printPriceDetails(buy, sell, true, typeIDs);

            var supply = sellOrders.slice();
            var demand = buyOrders.slice();
            supply.shift();
            demand.shift();
            recursiveSupplyDemandCheck(supply, demand, true)

            supply = sellOrders.slice();
            demand = buyOrders.slice();
            supply.shift();
            demand.shift();
            recursiveSupplyDemandCheck(supply, demand, false)
        } else {
            log(2, ' * Item: ' + nameOfType(typeID))
            printPrice(2, '   - best buy:  ', buy);
            printPrice(2, '   - best sell: ', sell);
            log(       2, '   - margin: ' + output.calcMargin(sell.bestPrice, buy.bestPrice) + "%");
        }
    }

    var end = Date.now();
    var elapsed = end - start;
    var elapsedSec = parseFloat(Math.round(elapsed / 1000 * 100) / 100).toFixed(2);

    log(2, elapsedSec + ' sec.');
    sellOrders = [];
    buyOrders = [];
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
            promises.push(requestOrdersForRegion(o.itemID, o.itemName, 'sell', typeId));
            promises.push(requestOrdersForRegion(o.itemID, o.itemName, 'buy', typeId));
        }
        await Promise.all(promises);
    } catch (e) {
        log(3, 'Error scanning regional market: \n' + e);
    }
}



/// HTTP request method
async function requestOrdersForRegion(regionId, regionName, type, typeId) {
    const url = 'https://esi.evetech.net/latest/markets/' + regionId + '/orders/?datasource=tranquility&order_type=' + type + '&page=1&type_id=' + typeId;
    

    try {
        const response = await axios(url);

        var orders = response.data.filter((o) => {
            // ignore lowsec
            if (eveSystems[o.system_id].security >= 0.45) {
                return true;
            }
            // if (eveSystems[o.system_id].security >= 0.45) {
            //     if (type == 'buy') { 
            //         if (eveSystems[o.system_id].name != "Jita") continue
            //     }
            //     else if (type == 'sell') { 
            //         if (eveSystems[o.system_id].name != "Amarr") continue
            //     }
            // }

        });
        const priceSort = (a, b) => {
            if (a.price < b.price) return -1;
            if (a.price > b.price) return 1;
            return 0;
        }
        orders.sort(priceSort);

        // best buy order is most expensive
        if (type == 'buy') {
            orders.reverse();
        }

        let bestOrder = orders.length > 0 ? orders[0] : null;
        if (bestOrder) {
            const sec = eveSystems[bestOrder.system_id].security;
            const systemName = eveSystems[bestOrder.system_id].name + ' ' + Math.round(sec * 10) / 10;
            var targetArray = null
            if (type == 'sell') {
                targetArray = sellOrders;
            } else if (type == 'buy') {
                targetArray = buyOrders;
            }
            // best region price
            targetArray.push({
                bestPrice: bestOrder.price,
                region: regionName,
                system: systemName,
                details: bestOrder,
                request: url,
                regionOrders: orders
            });
        } else {
            // console.log("error: " + url);
            // console.log("no " + type + " orders in " + regionName);
        }
    } catch (e) {
        log(3, "HTTP request failed for " + url + ": \n" + e);
    }
}
