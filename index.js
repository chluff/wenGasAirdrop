const axios = require('axios');
const fs = require('fs');
require('dotenv').config();


/**
 * Pulse IDO had 2 types of participants:
 * 1-staking pool
 * 2-lottery-based whitelisted pool
 * 
 *
 * Staking pool participants perform following actions:
 * 1-approve $PAD to stake (PAD token contract)
 * 2-stake $PAD (PadProxy contract)
 * 3-call Enroll (Pulse TDE contract)
 * 4-approve $USDT to swap ($USDT contract)
 * 5-swap (Pulse TDE contract)
 * 6-claim (Pulse TDE contract)
 * 7-unstake $PAD (PadProxy contract)
 *  => to get staking pool participants' list:
 * 1-get all TXs on Pulse TDE contract
 * 2-get addresses that enrolled and swapped at least once
 * 
 * 
 * Whitelist pool participants perform following actions:
 * 1-approve $USDT to swap ($USDT contract)
 * 2-swap (Pulse whitelist pool)
 * 3-claim (Pulse whitelist pool)
 *  => to get whitelist pool participants' list:
 * 1-get all TXs on Pulse whitelist pool contract
 * 2-get addresses that swapped at least once
 * 
 * 
 * Goal:
 * estimate total gas fees paid by each grouo
 * How?
 * 1-fetch all TXs on Pulse IDO pools, since number of TXs is smol.
 * 2-calculate total gas fees spent by each address to interact with IDO contracts
 * 3-estimate gas fees for interacting with token contracts (calling 'approve')
 * for 3 we make following assumption:
 * A-users call approve to perform some action on one of the IDO contracts 
 *   (stake $PAD, swap USDT) so the 2 transactions will be made in almost consecutive
 *   points in time, and thus gas price will be similar.
 * B-users call approve for each token action instead of infinite approval
 * => since gas amount used to approve a certain token is ~ same, estimate 3 this way:
 * for each action 'Act' that requires token approval (stake, swap):
 * add to user total gas fees: gasPrice(Act) * gasNeededToApprove
 */


/**
 * get stats for staking pool participants
 * only get TXs after Pulse TDE pool was ready, 1 block after
 * https://etherscan.io/tx/0x7b936236f1864d71ce9fc0a43bed30f476567a661093f7254077ac059fe68e3a
 */
let startBlock = 13358604;
let endBlock = 99999999;
const STAKING_POOL_ADDRESS = '0x337c36aBBe4fC6107C0a6F6ac11f8F2C47074a0D';
const GAS_APPROVE_PAD = '54000';
const GAS_APPROVE_USDT = '49000';
const sp_stats = {};
const sp_participants = [];

axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${STAKING_POOL_ADDRESS}&startblock=${startBlock}&endblock=${endBlock}&apikey=${process.env.ETHERSCAN_API_KEY}`)
.then(response => {

  if (response.data.message === 'OK') {

    for (let i = 0; i < response.data.result.length; i++) {
      let currentTx = response.data.result[i];
      if (!sp_stats.hasOwnProperty(currentTx.from)) {
        sp_stats[currentTx.from] = {
          enrolls: [],
          swaps: [],
          claims: [],
          stakes: [],
          unstakes: [],
          totalGasFee: "0"
        };
      }

      // Enroll() MethodID: 0xe65f2a7e
      if (currentTx.input === '0xe65f2a7e') {
        sp_stats[currentTx.from].enrolls.push(currentTx);
        sp_stats[currentTx.from].totalGasFee = (
          BigInt(sp_stats[currentTx.from].totalGasFee) + (BigInt(currentTx.gasUsed) * BigInt(currentTx.gasPrice))
        ).toString();
      }
      // Claim() MethodID: 0x4e71d92d
      else if (currentTx.input === '0x4e71d92d') {
        sp_stats[currentTx.from].claims.push(currentTx);
        sp_stats[currentTx.from].totalGasFee = (
          BigInt(sp_stats[currentTx.from].totalGasFee) + (BigInt(currentTx.gasUsed) * BigInt(currentTx.gasPrice))
          ).toString();
      }
      // Swap() MethodID: 0x94b918de
      else if (currentTx.input.includes('0x94b918de')) {
        sp_stats[currentTx.from].swaps.push(currentTx);
        sp_stats[currentTx.from].totalGasFee = (
          BigInt(sp_stats[currentTx.from].totalGasFee) + (BigInt(currentTx.gasUsed) * BigInt(currentTx.gasPrice))
          ).toString();
      }
    }

    // get list of addresses that enrolled and swapped at least once
    for (const address of Object.keys(sp_stats)) {
      if (sp_stats[address].enrolls.length > 0 && sp_stats[address].swaps.length > 0) {
        sp_participants.push(address);
      }
    }
    saveJsonData(sp_participants, 'dataStore/spParticipants.json');
    console.log(`${sp_participants.length} staking participants found`);

    /**
     * account for gas used by staking and unstaking PAD
     * we might be counting staking actions participants made
     * for other NearPAD IDOs, however out of the 233 staking pool participants
     * only 16 staked more than once
     * only 6 staked more than twice
     * so using Probability distribution to decide airdrop amount still holds
     * 
     * convert participants array to map for efficient lookups
     */
    const sp_participants_map = new Map(sp_participants.map(i => [i, true]));
    startBlock = 00000000;
    endBlock = 99999999;
    const PADPROXY_ADDRESS = '0x1637b1ccedb9c3f0d1c9c22a65c8a474b532a50f';

    axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${PADPROXY_ADDRESS}&startblock=${startBlock}&endblock=${endBlock}&apikey=${process.env.ETHERSCAN_API_KEY}`)
    .then(response => {

      if (response.data.message === 'OK') {

        for (let i = 0; i < response.data.result.length; i++) {
          let currentTx = response.data.result[i];
          // ignore non participant addresses
          if (!sp_participants_map.has(currentTx.from)) {
            delete sp_stats[currentTx.from];
            continue;
          }

          // Stake() MethodID: 0xa694fc3a
          if (currentTx.input.includes('0xa694fc3a')) {
            sp_stats[currentTx.from].stakes.push(currentTx);
            sp_stats[currentTx.from].totalGasFee = (
              BigInt(sp_stats[currentTx.from].totalGasFee) + (BigInt(currentTx.gasUsed) * BigInt(currentTx.gasPrice))
            ).toString();
          }
          // Unstake() MethodID: 0x2e17de78
          else if (currentTx.input.includes('0x2e17de78')) {
            sp_stats[currentTx.from].unstakes.push(currentTx);
            sp_stats[currentTx.from].totalGasFee = (
              BigInt(sp_stats[currentTx.from].totalGasFee) + (BigInt(currentTx.gasUsed) * BigInt(currentTx.gasPrice))
              ).toString();
          }
        }
        saveJsonData(sp_stats, 'dataStore/spStats.json');

        /**
         * add token approval estimates to each addresse's total fees
         * log total paid by each address to gas stats file
         */
        const sp_totalGas = [];
        for (participant of sp_participants) {
          let gasPaidEstimate = sp_stats[participant].totalGasFee;
          // add estimate for approvals to swap $USDT
          for (swap of sp_stats[participant].swaps) {
            gasPaidEstimate = (BigInt(gasPaidEstimate) + (BigInt(swap.gasPrice) * BigInt(GAS_APPROVE_USDT))).toString();
          }
          // add estimate for approvals to stake $PAD
          for (stake of sp_stats[participant].stakes) {
            gasPaidEstimate = (BigInt(gasPaidEstimate) + (BigInt(stake.gasPrice) * BigInt(GAS_APPROVE_PAD))).toString();
          }

          sp_totalGas.push({
            address: participant,
            estimateGasPaid: gasPaidEstimate 
          });
        }
        saveJsonData(sp_totalGas, 'dataStore/spGas.json');


      } else {
        console.log(`no TXs found for: ${curr_addr}`);
      }
    })
    .catch(error => {
      console.error(error);
    });

  } else {
    console.log(`no TXs found for: ${curr_addr}`);
  }
})
.catch(error => {
  console.error(error);
});



/**
 * get stats for whitelist pool participants
 * only get TXs after Pulse whitelist pool was ready, 1 block after
 * https://etherscan.io/tx/0x780a4f1fb73e65bfe893347ae7987b5e51ecdf3c7c07c947ef3fc4f19210f0e0
 */
 startBlock = 13367188;
 endBlock = 99999999;
 const WHITELIST_POOL_ADDRESS = '0xB40595582Ea43a58EC232Bc2A7A048635F4fB520';
 const wp_stats = {};
 const wp_participants = [];

 axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${WHITELIST_POOL_ADDRESS}&startblock=${startBlock}&endblock=${endBlock}&apikey=${process.env.ETHERSCAN_API_KEY}`)
.then(response => {

  if (response.data.message === 'OK') {

    for (let i = 0; i < response.data.result.length; i++) {
      let currentTx = response.data.result[i];
      if (!wp_stats.hasOwnProperty(currentTx.from)) {
        wp_stats[currentTx.from] = {
          swaps: [],
          claims: [],
          totalGasFee: "0"
        };
      }

      // Claim() MethodID: 0x4e71d92d
      if (currentTx.input === '0x4e71d92d') {
        wp_stats[currentTx.from].claims.push(currentTx);
        wp_stats[currentTx.from].totalGasFee = (
          BigInt(wp_stats[currentTx.from].totalGasFee) + (BigInt(currentTx.gasUsed) * BigInt(currentTx.gasPrice))
          ).toString();
      }
      // Swap() MethodID: 0x648b72b7
      else if (currentTx.input.includes('0x648b72b7')) {
        wp_stats[currentTx.from].swaps.push(currentTx);
        wp_stats[currentTx.from].totalGasFee = (
          BigInt(wp_stats[currentTx.from].totalGasFee) + (BigInt(currentTx.gasUsed) * BigInt(currentTx.gasPrice))
          ).toString();
      }
    }

    // get list of addresses that swapped at least once
    for (const address of Object.keys(wp_stats)) {
      if (wp_stats[address].swaps.length > 0) {
        wp_participants.push(address);
      }
    }

    // remove non participant addresses from stats
    const wp_participants_map = new Map(wp_participants.map(el => [el, true]));
    for (let address of Object.keys(wp_stats)) {
      if (!wp_participants_map.has(address)) delete wp_stats[address];
    }
    saveJsonData(wp_stats, 'dataStore/wpStats.json');
    saveJsonData(wp_participants, 'dataStore/wpParticipants.json');
    console.log(`${wp_participants.length} whitelist participants found`);

    /**
     * add token approval estimates to each addresse's total fees
     * log total paid by each address to gas stats file
     */
    const wp_totalGas = [];
    for (participant of wp_participants) {
      let gasPaidEstimate = wp_stats[participant].totalGasFee;
      // add estimate for approvals to swap $USDT
      for (swap of wp_stats[participant].swaps) {
        gasPaidEstimate = (BigInt(gasPaidEstimate) + (BigInt(swap.gasPrice) * BigInt(GAS_APPROVE_USDT))).toString();
      }

      wp_totalGas.push({
        address: participant,
        estimateGasPaid: gasPaidEstimate 
      });
    }
    saveJsonData(wp_totalGas, 'dataStore/wpGas.json');

  } else {
    console.log(`no TXs found for: ${curr_addr}`);
  }
})
.catch(error => {
  console.error(error);
});



/**
 * persist data on json file
 * 
 * @param {Object} data 
 * @param {string} filePath 
 */
function saveJsonData(data, filePath) {
  // log data to JSON file
	let dataStr = JSON.stringify(data);
	fs.writeFileSync(filePath, dataStr);
	console.log(`success! data saved to ${filePath}`); 
}
