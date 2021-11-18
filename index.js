const axios = require('axios');
const fs = require('fs');
require('dotenv').config();


/** 
 * read addresses from Pulse short list at:
 * https://docs.google.com/spreadsheets/d/152y4f_FAsYy-w2RQl6P7q19fsiA8AqMcqoMh_Oe-3Ek 
 * 
*/
let csvContent = fs.readFileSync('PulseShortlist.csv','utf8');
const allAddresses = [];
for(let row of csvContent.split("\r\n")){
  const rowItems = row.split(",");
  allAddresses.push(rowItems[0].toString());
}
console.log(`Pulse short list has ${allAddresses.length} addresses in total`);


// store for relevant TX info per address
let stats = [];
// only check TXs after Pulse IDO announcement: https://twitter.com/pulsemarkets/status/1433542278845394974
// block 13148157 is last before timestamp: 1630610887
const startBlock = 13148157;
// only check TXs before Pulse gas refund announcement: https://twitter.com/pulsemarkets/status/1446206119907676161
// block 13373859 is last after timestamp: 1633637340
const endBlock = 99999999 //13373859;
// only check transactions to addresses relevant to pulse IDO
const watchList = [
  '0x52a047ee205701895ee06a375492490ec9c597ce', // Pulse token
  '0xea7Cc765eBC94C4805e3BFf28D7E4aE48D06468A', // nearPad token
  '0x1637B1Ccedb9c3f0d1c9C22A65C8A474b532a50F' // nearPad proxy
]
// interval duration in ms
const inter_dur = 202;
console.log(`time required to query all data: ${inter_dur * allAddresses.length * 0.001} seconds`);


// Etherscan API is rate limited to 5 calls/s => 1 call each 200ms
let x = 0;
var myInterval = setInterval(function () {

  // query Etherscan API for TXs made between DATE1 and DATE2
  axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${allAddresses[x]}&startblock=${startBlock}&endblock=${endBlock}&apikey=${process.env.ETHERSCAN_API_KEY}`)
    .then(response => {
      // get current address
      const resp_url = new URL(response.config.url);
      const search_params = resp_url.searchParams;
      const curr_addr = search_params.get('address');

      if (response.data.message === 'OK') {

        let gasUsedArr = [], gasPriceArr = [], gasEthPaidArr = [];
        for (let i = 0; i < response.data.result.length; i++) {
          // ignore TXs not relevant to Pulse IDO
          if (!watchList.includes(response.data.result[i].to)) continue;
          let gasUsed = response.data.result[i].gasUsed;
          let gasPrice = response.data.result[i].gasPrice;
          let gasEthPaid = BigInt(gasUsed) * BigInt(gasPrice);
          gasUsedArr.push(gasUsed);
          gasPriceArr.push(gasPrice);
          gasEthPaidArr.push(gasEthPaid.toString());
        }
        let entry = {
          address: curr_addr,
          allGasUsed: gasUsedArr, //array of gas used per TX
          allGasPrice: gasPriceArr, //array of gas price per TX
          allGasEthPaid: gasEthPaidArr, //amount paid for each TX in Wei
          totalGasEthPaid: gasEthPaidArr.reduce((a, b) => (BigInt(a) +  BigInt(b)).toString(), "0") // total ETH (in WEI) spent on gas 
        };

        if (entry.totalGasEthPaid != 0) stats.push(entry);

      } else {
        console.log(`no TXs found for: ${curr_addr}`);
      }
    })
    .catch(error => {
      console.error(error);
    });

  if (++x === allAddresses.length) {
    clearInterval(myInterval);
    // some requests might be still processing
    setTimeout(saveData, 5000);
  }
}, inter_dur);


function saveData() {
  // log data to JSON file
	let data = JSON.stringify(stats);
	fs.writeFileSync('dataStore/stats.json', data);
	console.log(`success! data saved to dataStore/stats.json`); 
}
