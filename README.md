# bitcoin_tracker

Bitcoin tracker is a twitter bot designed to track individuals with one or may wallets and post transactions (deposits/withdrawals) as well as daily "lifetime" stats. You need to configure the twitter details in config.js from whatever your application settings are at apps.twitter.com. You need to define addresses of the wallet or wallets you want to track. The Name variable is a pretty description used in tweets, and filename is where you want the transaction log stored. You can see an example of how this is used at [@neonaziwallets](https://twitter.com/neonaziwallets)

I have this run via cron every 15 minutes without arguments and I run with the check argument once a day. If you define Name and filename correctly, you can run multiple in the same directory easy enough.

Fields in the json transaction report are:
```
address_to - the address of the wallet the payment went to

addresses_from -the bitcoin address(es) the payment came from, separated by | if more than one

num_addresses_from - the number of addresses the payment came from (sometimes they come from more than one)

tx_hash - the unique identifier of the payment transaction

val_satoshi - the value of the payment in satoshi, kind of like the pennies of bitcoin

val_btc - the value of the payment in bitcoin

unix_time - timestamp
```

The data is pulled from blockchain.info with BTC values pulled from coindesk.

## Install

`npm install` should do the trick, it only requires a few other npm prereqs.
