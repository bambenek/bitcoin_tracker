// This code was adapted from Keith Collins' actual_ransom code at https://github.com/keithcollins/actual_ransom
// He deserves major props.

var fs = require('fs');
var request = require("retry-request");
var d3 = require('d3');
var queue = require('queue-async');
var sb = require('satoshi-bitcoin');
var twit = require('twit');
var sleep = require('sleep');
var config = require('./config.js');
var Twitter = new twit(config);

// You will need to define Name (used in tweets) and filename (for transaction log).
var Name = "";
var filename = "";

// Check if json array exists, and if not create it

if (fs.existsSync(__dirname+"/"+filename+".json")) {
  console.log("Transaction file exists, continuing.");
  } else { 
  fs.writeFileSync(__dirname+"/"+filename+".json", '[]');
  console.log("Transaction file created.");
  }

// Just in case

sleep.sleep(1);

// the bitcoin addresses associated with who you want to monitor, multiple accounts can be aggregated
// by using multiple values with a comma.
var addresses = [
  ""
];

// load saved transactions
var transactions = JSON.parse(fs.readFileSync(__dirname+"/"+filename+".json", 'utf8'));

// Get wallet lifetime data (balance, total sent, total received)
var current_total = getTotalBalance(addresses);
var current_sent = getTotalSent(addresses);
var current_rec = getTotalReceived(addresses);

function checkVariable() {

  if (current_total == true && current_sent == true && current_rec == true) {
     return;
  } else {
// Just in case
     sleep.sleep(1);
  }
}
setTimeout(checkVariable, 1000);
// to keep new txs separate from current until later
var new_transactions = [];

// for number formatting
var addCommas = d3.format("0,000");

// create queue
var q = queue(3);

// defer API calls for each address to check for new payments
for (var i = 0; i < addresses.length; i++) {
  q.defer(checkWallets, i);
}

// when all is done
q.await(function(e,d){
  // tweet new transactions
  if (new_transactions.length > 0) {
    // to add new txs to total if new incoming tx
    var new_total_satoshi = sb.toSatoshi(current_total);
    new_transactions.forEach(function(tx){
      // merge in new transaction
      transactions.push(tx);
      var val_satoshi = Math.abs(tx.val_satoshi);
      // get current USD value
      getUSDRate(function(rate){
        var usd = (sb.toBitcoin(val_satoshi)*rate).toFixed(2);
        if (tx.val_satoshi < 0) {
          // outgoing transaction
          var str = ""+sb.toBitcoin(val_satoshi)+" BTC ($"+addCommas(usd)+" USD) just withdrawn from BTC wallet tied to "+Name+". https://blockchain.info/tx/"+tx.tx_hash;
          doTweet(str);
        } else if (tx.val_satoshi > 0) {
          // incoming transaction
          new_total_satoshi += val_satoshi;
          var newbal = current_total/100000000;
          var new_usd = (newbal*rate).toFixed(2);
          var str = "New payment to "+Name+":\n"
          str += +sb.toBitcoin(val_satoshi)+" BTC ($"+addCommas(usd)+")\n";
          str += "https://blockchain.info/tx/"+tx.tx_hash+"\n";
          str += "Total of "+Name+" BTC wallets:\n";
          str += ""+newbal+" BTC ($"+addCommas(new_usd)+")";
          doTweet(str);

          // this was used before payments mostly stopped
          var str = "Someone just paid "+sb.toBitcoin(val_satoshi)+" BTC ($"+addCommas(usd)+" USD) to BTC wallet tied to "+Name+". https://blockchain.info/address/"+tx.address_to;
        }
      });
    });
    // save new transactions
    fs.writeFileSync(__dirname+"/"+filename+".json", JSON.stringify(transactions), 'utf8');
  }
  // check and tweet current totals if 'check' argument was used
  if (process.argv[2] == "check") {
    var newbal = current_total/100000000;
    var newrec = current_rec/100000000;
    var newspend = current_sent/100000000;
    getUSDRate(function(rate){
      var usd = (newrec*rate).toFixed(2);
      var usd2 = (newspend*rate).toFixed(2);
      var usd3 = (newbal*rate).toFixed(2);
    getUSDRate(function(rate){
      var usd = (newrec*rate).toFixed(2);
      var usd2 = (newspend*rate).toFixed(2);
      var usd3 = (newbal*rate).toFixed(2);
      var str = ""+Name+" daily wallet summary report (Lifetime Numbers): \nRec: "+newrec+" BTC ~$"+addCommas(usd)+" USD, Spent: "+newspend+" BTC ~$"+addCommas(usd2)+", Bal: "+newbal+" BTC ~$"+addCommas(usd3)+".\n";
      doTweet(str); 
        });
    });
  }
});

// do blockchain API call
function checkWallets(i,cb) {
  request({url:"https://blockchain.info/rawaddr/"+addresses[i],json: true},function (e, r, body) {
    if (!e && r.statusCode === 200) {
      // loop through all of this wallet's transactions
      body.txs.forEach(function(tx){
        // have we already saved this transaction to transactions?
        if (transactions.filter(function(d) { return d.tx_hash == tx.hash; }).length == 0) {
          // we have not, so it's new
          // check if this is a withdraw by looking at inputs
          var outgoing_satoshi = d3.sum(tx.inputs, function(input){
            // if the input address matches this wallet, add it to sum
            if (input.prev_out.addr == addresses[i]) {
              return +input.prev_out.value;
            }
          });
          // which way is this transaction going
          var from_addresses = [];
          var val_satoshi = 0;
          if (outgoing_satoshi > 0) {
            // it's a withdraw/ outgoing btc
            val_satoshi = -outgoing_satoshi;
          } else {
            // this is a new payment
            // search outs array for address matching this wallet
            // there should only be one, and its value = value of new payment
            val_satoshi = tx.out.filter(function(d){
              return d.addr == addresses[i];
            })[0].value;
            // since it's incoming, collect the
            // addresses it's coming from
            tx.inputs.forEach(function(input){
              from_addresses.push(input.prev_out.addr);
            });
          }
          // save new transaction to array
          new_transactions.push({
            address_to: addresses[i],
            addresses_from: from_addresses.join("|"),
            num_addresses_from: from_addresses.length,
            tx_hash: tx.hash,
            val_satoshi: val_satoshi,
            val_btc: sb.toBitcoin(val_satoshi),
            unix_time: tx.time
          });
        }
      });
      cb(null);
    }
  });
}

function getUSDRate(cb) {
  request({url: "http://api.coindesk.com/v1/bpi/currentprice.json",json: true},function (e, r, body) {
    if (!e && r.statusCode === 200) {
      cb(+body.bpi.USD.rate_float);
    }
  });
}

function getTotalBTC(transactions) {
  // get total payments in satoshi
  var total_satoshi = d3.sum(transactions,function(d){ return +d.val_satoshi });
  // convert sotashi to btc
  return sb.toBitcoin(total_satoshi);
}

function getTotalBalance(addresses, cb) {
  var addresslist = addresses.join("|");
  request({url:"https://blockchain.info/q/addressbalance/"+addresslist}, function (ebal, rbal, bal) {
    current_total = bal;
    return bal;
  });
}

function getTotalReceived(addresses, cb) {
  var addresslist = addresses.join("|");
  request({url:"https://blockchain.info/q/getreceivedbyaddress/"+addresslist}, function (e, r, rec) {
  if (!e && r.statusCode === 200) {
    current_rec = rec;
    return rec;
    }
  });
}

function getTotalSent(addresses, cb) {
  var addresslist = addresses.join("|");
  request({url:"https://blockchain.info/q/getsentbyaddress/"+addresslist}, function (e, r, sent) {
    if (!e && r.statusCode === 200) {
      current_sent = sent;
      return sent;
    }
  });
}

function doTweet(str) {
/*Twitter.post('statuses/update', { status: str }, function(err, data, response) {
})
*/
  console.log(str);

}
