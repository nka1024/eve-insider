const eilog = require('./ei-log.js');

function log(level, s) {
    eilog.log(level, s);
}

const formatAmount = (n) => {
    return n.toLocaleString('ru-RU').replace(',', ' ');
}

const formatIsk = (price) => {
    if (price)
        return price.toLocaleString('en-US') + " ISK"
    else
        return 'err';
}

const timeAgo = (ms) => {
    var delta = Math.abs(Date.now() - ms) / 1000;
    var days = Math.floor(delta / 86400);
    delta -= days * 86400;
    var hours = Math.floor(delta / 3600) % 24;
    delta -= hours * 3600;
    var minutes = Math.floor(delta / 60) % 60;
    delta -= minutes * 60;
    var seconds = Math.floor(delta % 60);
    var res = days > 0 ? days + "d " : "";
    res += hours > 0 ? hours + "h " : "";
    res += minutes > 0 ? minutes + "m " : "";
    res += seconds > 0 ? seconds + "s " : "";
    return res + "ago";
}
const timeAbs = (ms) => {
    let date = new Date(ms);
    var opt = { timeZone: 'UTC', hour12: false };
    return date.toLocaleDateString('en-US', opt) + " " + date.toLocaleTimeString('en-US', opt)
}


module.exports = {
    printRawOrderData: (ll, data) => {
        let volume = formatAmount(data.volume_remain) + ' / ' + formatAmount(data.volume_total);
        let issued = timeAgo(Date.parse(data.issued))
        let absolute = timeAbs(Date.parse(data.issued))
        log(ll, ' *   issued: \'' + issued + '\' (' + absolute + ')');
        log(ll, ' *    price: ' + formatIsk(data.price))
        log(ll, ' *   volume: ' + volume + ' (min: ' +formatAmount(data.min_volume)+ ')')
        // log(ll, '     typeID: ' + data.type_id)
        // log(ll, '   systemID: ' + data.system_id)
        // log(ll, '    orderID: ' + data.order_id)
        // log(ll, '     typeID: ' + data.location_id)
    },

    printOrderShort: (buy, sell, typeID, name, ll) => {
        let margin =  module.exports.calcMargin(sell.bestPrice, buy.bestPrice);
        log(                      ll, ' * Item: "' + name + '" ('+typeID+') ')
        module.exports.printPrice(ll, '   - best buy:  ', buy);
        module.exports.printPrice(ll, '   - best sell: ', sell);
        log(                      ll, '   - margin: ' + margin + "%");
    },

    printOrderDetails: (buyObj, sellObj, verbose, typeIDs) => {
        if (!sellObj || !sellObj) {
            logLevel(3, 'error printing price details');
            return;
        }
        let quantity = Math.min(sellObj.details.volume_remain, buyObj.details.volume_remain);
        let ppi = buyObj.bestPrice - sellObj.bestPrice
        let profit = quantity * (buyObj.bestPrice - sellObj.bestPrice)
        let volume = typeIDs[buyObj.details.type_id].volume
        let margin = module.exports.calcMargin(sellObj.bestPrice, buyObj.bestPrice)
        let ppv = ppi / volume;
        let p = verbose ? '+' : ' '
        let ll = 1;

        if (verbose) {
            log(ll, "    SELL: " + sellObj.request);
            log(ll, "    BUY:  " + buyObj.request);
            log(ll, "    ---------------------  type: " + sellObj.details.type_id)
            log(ll, "   | SELL order details  | order: " + sellObj.details.order_id)
            log(ll, "    ---------------------  location: " + sellObj.details.location_id)
            module.exports.printRawOrderData(ll, sellObj.details);
            log(ll, "    ---------------------  type: " + buyObj.details.type_id)
            log(ll, "   |  BUY order details  | order: " + buyObj.details.order_id)
            log(ll, "    ---------------------  location: " + buyObj.details.location_id)
            module.exports.printRawOrderData(ll, buyObj.details);
            log(ll, ' ');
        }
        log(ll, p + ' Projected profit: \'' + formatIsk(Math.round(profit)) + '\'')
        log(ll, '                m3: \'' + formatAmount(Math.round(quantity * volume))+ '\'')
        log(ll, '            ISK/m3: ' + formatIsk(ppv))
        log(ll, '          ISK/item: ' + formatIsk(ppi))
        log(ll, '            margin: ' + margin + "%")
        log(ll, '          quantity: ' + formatAmount(quantity))
        log(ll, ' ');
        log(ll, '  ***  ' + formatIsk(Math.round(profit)) + 
                '  ***  ' + Math.round(quantity * volume) + " m3" +
                '  ***  "' + typeIDs[buyObj.details.type_id].name['en'] + '"' +
                '  *** "' + sellObj.region + '" -> "' + buyObj.region + '"' );

    },

    printPrice: (logLevel, title, priceObj) => {
        if (!priceObj) {
            log(logLevel, title + '  unknown');
            return;
        }
        var res = title + formatIsk(priceObj.bestPrice);
        res += " in '" + priceObj.system + "'";
        res += " (region: '" + priceObj.region + "')";
        log(logLevel, res);
    },
    calcMargin: (sellPrice, buyPrice) => {
        let ppi = buyPrice - sellPrice
        return Math.round(100 *(100*ppi/buyPrice))/100;
    }
    
}

