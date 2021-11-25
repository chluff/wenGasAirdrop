# wenGasAirdrop  

to run this script you need an Etherscan api token. Get one [here](https://etherscan.io/apis)  

## Quick Start:  
1. Install dependencies: `yarn`  
2. create `.env` using `.env.example` as a template  
3. replace $YOUR_ETHERSCAN_API_KEY  
4. run the script: `yarn start`  

## Output:  
the script outputs 6 files under the directory `dataStore`.  
output files start with one of the following prefixes:  
 - 'sp' for stake pool based IDO pool  
 - 'wp' for whitelist based IDO pool  

`wpParticipants` and `spParticipants` contain a list of participating addresses for each pool (array of strings)  
`wpGas` and `spGas` contain a list of: addresses + their total estimated gas fees in wei, like:  
```json
[{"address":"0xa7e5a837382c4b2a484bd2afadc8b5a5f6d74e87","estimateGasPaid":"45444102055032282"},{"address":"0x8204171f30801f13ac9ddbdb9eb62486b415b3d3","estimateGasPaid":"66723838713298301"}]
```  
`wpStats` and `spStats` contain exhaustive information about transactions made by each participant for the IDO.  