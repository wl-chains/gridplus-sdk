import { Client, providers } from 'index';
import bitcoin from 'bitcoinjs-lib';
import NodeCrypto from 'gridplus-node-crypto';
import { assert } from 'elliptic/lib/elliptic/utils';
const { baseUrl, btcHolder, blockcypherApiKey } = require('../secrets.json');
let client, deviceAddresses, utxo;
const balance0 = 0;
process.on('unhandledRejection', e => { throw e; });

const bcy = {                    // blockcypher testnet (https://www.blockcypher.com/dev/bitcoin/#testing)
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4
  },
  pubKeyHash: 0x1b,
  // pubKeyHash: 0x00,     // I think this is the same as mainnet, but not totally sure
  scriptHash: 0x1b,
  wif: 0x49
};

const network = 'bcy';
const holderAddress = btcHolder.bcyAddress

describe('Bitcoin via BlockCypher: transfers', () => {
  before(() => {
    const btc = new providers.Bitcoin({ apiKey: blockcypherApiKey, network, blockcypher: true, timeout: 750 });
    client = new Client({
      baseUrl: baseUrl ? baseUrl : undefined,
      name: 'blockcypher-test',
      crypto: NodeCrypto,
      privKey: NodeCrypto.randomBytes(32).toString('hex'),
      providers: [ btc ],
    }) 
  })

  it('Should connect to a BTC node provider', (done) => {
    client.initialize((err, provider) => {
      assert(err === null, err);
      assert(typeof provider === 'object');
      assert(provider[0].height > 0);
      done();
    });
  });

  it('Should connect to an agent', (done) => {
    const serial = process.env.AGENT_SERIAL;
    client.connect(serial, (err, res) => {
      assert(err === null, err);
      assert(client.client.ecdhPub === res.key, 'Mismatched key on response')
      done()
    });
  });

  it('Should pair with the agent', (done) => {
    const appSecret = process.env.APP_SECRET;
    console.log('appSecret:', appSecret)
    client.pair(appSecret, (err) => {
      assert(err === null, err)
      done();
    });
  });

  it('Should get the first 2 Bitcoin addresses of the manual permission and log address 0', (done) => {
    const req = {
      total: 2,
      network,
      segwit: false
    }
    client.addresses(req, (err, addresses) => {
      assert(err === null, err);
      assert(addresses.length === 2);
      assert(addresses[0].slice(0, 1) === 'B' || addresses[0].slice(0, 1) === 'C', 'Address 1 is not a BCY address');
      assert(addresses[1].slice(0, 1) === 'B' || addresses[1].slice(0, 1) === 'C', 'Address 2 is not a BCY address')
      deviceAddresses = addresses;
      // // Get the baseline balance for the addresses
      client.getBalance('BTC', { address: deviceAddresses }, (err) => {
        assert(err === null, err);
        done()
      });
    });
  });
 
  it('Should get the BCY testnet balance of the holder account', (done) => {
    client.getBalance('BTC', { address: holderAddress }, (err, data) => {
      assert.equal(err, null, err);
      assert(data.utxos.length > 0, `address (${holderAddress}) has not sent or received any bitcoins. Please request funds from the faucet (https://coinfaucet.eu/en/btc-testnet/) and try again.`);
      data.utxos.some((u) => {
        if (u.value >= 10000 && u.height > 0 && u.index !== undefined) {
          utxo = u;
          return true;
        }
      });
      assert(utxo !== undefined, `Unable to find an output with value >=10000 for address ${holderAddress}`);
      done();  
    });
  });

  // LEAVE THESE 3 COMMENTED FOR NOW 
  // =-----------------------------------

  // it('Should get UTXOs for a few addresses', (done) => {
  //   const addresses = deviceAddresses.concat(holderAddress);
  //   client.getBalance('BTC', { address: addresses }, (err, balances) => {
  //     assert(err === null, err);
  //     assert(typeof balances[deviceAddresses[0]].balance === 'number', 'Balance not found for address 0');
  //     assert(typeof balances[deviceAddresses[1]].balance === 'number', 'Balance not found for address 1');
  //     assert(typeof balances[holderAddress].balance === 'number', 'Balance not found for btcHolder address.');
  //     assert(balances[holderAddress].balance > 0, 'Balance should be >0 for btcHolder address');
  //     balance0 = balances[deviceAddresses[0]].balance;
  //     done();   
  //   })
  // });

  it('Should get transaction history for the holder', (done) => {
    client.getTxHistory('BTC', { addresses: holderAddress }, (err, txs) => {
      assert(err === null, err);
      assert(txs.length > 0, 'btcHolder address should have more than one transaction in history');      
      done();     
    })
  })

  it('Should get transaction history for all 3 addresses', (done) => {
    const addresses = deviceAddresses.concat(holderAddress);
    client.getTxHistory('BTC', { addresses }, (err, txs) => {
      assert(err === null, err);
      assert(txs.length > 0);
      done();
    })
  })

  // =-----------------------------------------

  it('Should spend a small amount from the holder address', (done) => {
    if (balance0 === 0) {
      const signer = bitcoin.ECPair.fromWIF(btcHolder.bcyWif, bcy);
      const txb = new bitcoin.TransactionBuilder(bcy);
      txb.addInput(utxo.hash, utxo.index);
      // // Note; this will throw if the address does not conform to the testnet
      // // Need to figure out if regtest emulates the mainnet
      txb.addOutput(deviceAddresses[0], 10000);
      txb.addOutput(holderAddress, utxo.value - 10000 - 100);
      txb.sign(0, signer);
      
      const tx = txb.build().toHex();
      client.broadcast('BTC', { tx }, (err) => {
        assert(err === null, err);
        // sentTx = res;
        done();
      });
    } else {
      done();
    }
  });

  it('Should get the utxo of the new account', (done) => {
    const a = deviceAddresses[0];
    let count = 0;
    const interval = setInterval(() => {
      client.getBalance('BTC', { address: a }, (err, data) => {
        if (count > 10) {
          assert.equal(err, null, err);      
          assert(data.utxos.length > 0, `Address (${a}) has not sent or received any bitcoins. Please request funds from the faucet (https://coinfaucet.eu/en/btc-testnet/) and try again.`);
          assert(data.utxos[0].height > 0 && data.utxos[0].index !== undefined, `Address (${a}) has a transaction, but it has not been confirmed. Please wait until it has`);
          done();
        } else if (data.utxos.length > 0 && data.utxos[0].height > 0) {
          clearInterval(interval);
          done();
        } else {
          count += 1;
        }
      });
    }, 10000);
  });

  it('Should spend some of the new coins from the lattice address', (done) => {
    const req = {
      schemaCode: 'BTC',
      params: {
        version: 1,
        lockTime: 0,
        recipient: 'CFr99841LyMkyX5ZTGepY58rjXJhyNGXHf',
        value: 100,
        change: null,
        changeAccountIndex: 1
      },
      network: 'bcy',
      sender: [ deviceAddresses[0], deviceAddresses[1] ],
      accountIndex: [ 0, 1 ],
      perByteFee: 1,   // optional
      multisig: false, // optional
    }

    client.sign(req, (err, res) => {
      assert(err === null, err);
      setTimeout(() => {
        client.broadcast('BTC', res, (err2, txHash) => {
          assert(err2 === null, err2);
          let count = 0;
          const interval = setInterval(() => {
            client.getTx('BTC', txHash, (err, tx) => {
              if (count > 10) {
                assert.equal(err, null, err);      
                throw new Error('Transaction did not mine in time');
              } else if (tx.height > -1) {
                assert(tx.timestamp !== undefined);
                clearInterval(interval);
                done();
              } else {
                count += 1;
              }
            });
          }, 10000);
        });
      }, 750);
    });
  });

  it('Should create an automated permission.', (done) => {
    const req = {
      schemaCode: 'BTC',
      timeLimit: 0,
      params: {
        value: { lt: 100000, gt: 1 }
      }
    };
    client.addPermission(req, (err) => {
      assert(err === null, err);
      done();
    });
  });

  it('Should make an automated signature request and broadcast the response in a transaction.', (done) => {
    const recipient = 'CFr99841LyMkyX5ZTGepY58rjXJhyNGXHf'; // random address
    const req = {
      usePermission: true,
      schemaCode: 'BTC',
      params: {
        version: 1,
        lockTime: 0,
        recipient: recipient,
        value: 100,
        change: null,
        changeAccountIndex: 1,
      },
      network: 'bcy',
      sender: [ deviceAddresses[0], deviceAddresses[1] ],
      accountIndex: [ 0, 1 ],
      perByteFee: 1,   // optional
      multisig: false, // optional
    }

    client.sign(req, (err, res) => {
      assert(err === null, err);
      setTimeout(() => {
        client.broadcast('BTC', res, (err2, txHash) => {
          assert(err2 === null, err2);
          let count = 0;
          const interval = setInterval(() => {
            client.getTx('BTC', txHash, (err, tx) => {
              if (count > 10) {
                assert.equal(err, null, err);      
                throw new Error('Transaction did not mine in time');
              } else if (tx && tx.height > -1) {
                const o1 = tx.data.outputs[0].addresses[0];
                if (o1 !== recipient) throw new Error(`Recipient did not receive output. Sent to ${o1}, but expected ${recipient}`);
                const v1 = tx.data.outputs[0].value;
                if (v1 !== req.params.value) throw new Error(`Output value incorrect. Sent ${v1}, but expected ${req.params.value}`);
                const o2 = tx.data.outputs[1].addresses[0];
                const expectedO2 = deviceAddresses[req.params.changeAccountIndex]
                if (o2 !== expectedO2) throw new Error(`Change did not go to correct address. Sent to ${o2} but expected ${expectedO2}`);
                clearInterval(interval);
                done();
              } else {
                count += 1;
              }
            });
          }, 10000);
        });
      }, 750);
    });
  });

});