// Basic tests for atomic SDK functionality
import assert from 'assert';
import Tx from 'ethereumjs-tx';
import config from '../src/config.js';
import { Client, providers, tokens } from 'index';
import NodeCrypto from 'gridplus-node-crypto';
const crypto = require('crypto');
const { erc20Src } = require('./config.json');
const { ethHolder } = require('../secrets.json');
const transferAmount = 154;
const randAddr = '0xdde20a2810ff23775585cf2d87991c7f5ddb8c22';

let client, addr, erc20Addr, erc20Addr2, sender, senderPriv, balance, secrets;

describe('Ethereum', () => {

  before(() => {
    try { secrets = require('../secrets.json'); } 
    catch (e) { ; }
    const ethConfig = secrets ? secrets.ethNode : undefined; 
    const eth = new providers.Ethereum(ethConfig);
    client = new Client({
        baseUrl: secrets ? secrets.baseUrl : undefined,
        name: 'basic-test',
        crypto: NodeCrypto,
        privKey: NodeCrypto.randomBytes(32).toString('hex'),
        providers: [ eth ],
    });

  });

  it('Should connect to an ETH node', (done) => {
    client.initialize((err, provider) => {
      assert(err === null, err);
      assert(typeof provider === 'object');
      done();
    })
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
    console.log('Pairing with secret', appSecret)
    client.pair(appSecret, (err) => {
      assert(err === null, err)
      done();
    });
  });

  it('Should get the ETH address', (done) => {
    const req = {
      total: 1,
      coin_type: '60\''
    }
    client.addresses(req, (err, addresses) => {
      assert(err === null, err);
      addr = addresses;
      client.getBalance('ETH', { address: addr }, (err, data) => {
        assert.equal(err, null, err);
        assert(data.nonce > -1);
        balance = data.balance;
        done();
      });
    });
  });

  const toSend = Math.pow(10, 18);
  it('Should transfer ETH to the address', (done) => {
    sender = ethHolder;
    senderPriv = Buffer.from(sender.privKey, 'hex');
    const tx = {
      nonce: null,
      gasPrice: 100000000,
      gas: 100000,
      from: sender.address,
      to: addr,
      value: toSend,
      data: ''
    };
    client.providers.ETH.getNonce(tx.from)
    .then((nonce) => {
      tx.nonce = nonce;
      const txObj = new Tx(tx);
      txObj.sign(senderPriv);
      const serTx = txObj.serialize();
      const data = { tx: `0x${serTx.toString('hex')}` };
      client.broadcast('ETH', data, (err, txHash) => {
        assert(err === null, err);
        setTimeout(() => {
          client.getTx('ETH', txHash, (err, txs) => {
            assert(err === null, err);
            assert(txs.height > 0, 'Tx was not mined');
            done();
          });
        }, 300);
      })
    })
    .catch((err) => { throw new Error(err); })
  });

  it('Should find a non-zero ETH balance for the address', (done) => {
    client.getBalance('ETH', { address: addr }, (err, data) => {
      assert(err === null, err);
      const _balance = data.balance;
      assert(typeof _balance === 'number');
      // Note that _balances are returned in whole units (ether)
      assert(_balance === balance + toSend, `Expected balance of ${balance + toSend}, but got ${_balance}`);
      balance = _balance;
      done();
    });
  });

  it('Should deploy an ERC20 token', (done) => {
    const tx = {
      nonce: null,
      gasPrice: 1000000,
      gas: '0x1e8480', 
      from: sender.address,
      value: 0,
      data: erc20Src
    };

    client.providers.ETH.getNonce(tx.from)
    .then((nonce) => {
      tx.nonce = nonce;
      const txObj = new Tx(tx);
      txObj.sign(senderPriv);
      const serTx = txObj.serialize();
      const data = { tx: `0x${serTx.toString('hex')}` };
      client.broadcast('ETH', data, (err, txHash) => {
        assert(err === null, err);
        client.providers.ETH.provider.getTransactionReceipt(txHash)
        .then((receipt) => {
          assert(receipt.contractAddress !== undefined, 'Contract did not deploy properly');
          erc20Addr = receipt.contractAddress;
          done();
        })
        .catch((err) => { assert(err === null, `Got Error: ${err}`); done(); });
      })
    })
    .catch((err) => { throw new Error(err); })
  });

  it('Should deploy a second ERC20 token', (done) => {
    const tx = {
      nonce: null,
      gasPrice: 1000000,
      gas: '0x1e8480', 
      from: sender.address,
      value: 0,
      data: erc20Src
    };
    client.providers.ETH.getNonce(tx.from)
    .then((nonce) => {
      tx.nonce = nonce;
      const txObj = new Tx(tx);
      txObj.sign(senderPriv);
      const serTx = txObj.serialize();
      const data = { tx: `0x${serTx.toString('hex')}` };
      client.broadcast('ETH', data, (err, txHash) => {
        assert(err === null, err);
        client.providers.ETH.provider.getTransactionReceipt(txHash)
        .then((receipt) => {
          assert(receipt.contractAddress !== undefined, 'Contract did not deploy properly');
          erc20Addr2 = receipt.contractAddress;
          done();
        })
        .catch((err) => { assert(err === null, `Got Error: ${err}`); done(); });
      })
    })
    .catch((err) => { throw new Error(err); })
  });

  it('Should transfer some ERC20 (1) tokens to the address', (done) => {
    const tx = {
      nonce: null,
      to: erc20Addr,
      gasPrice: 1000000,
      gas: 100000, 
      from: sender.address,
      value: 0,
      data: config.erc20.transfer(addr, transferAmount),
    };
    client.providers.ETH.getNonce(tx.from)
    .then((nonce) => {
      tx.nonce = nonce;
      const txObj = new Tx(tx);
      txObj.sign(senderPriv);
      const serTx = txObj.serialize();
      const data = { tx: `0x${serTx.toString('hex')}` };
      client.broadcast('ETH', data, (err, txHash) => {
        assert(err === null, err);
        client.getTx('ETH', txHash, (err, minedTx) => {
          assert(err === null, err);
          assert(minedTx.height > -1);
          done();
        });
      });
    })
    .catch((err) => { throw new Error(err); })
  });

  it('Should transfer some ERC20 (2) tokens to the address', (done) => {
    const tx = {
      nonce: null,
      to: erc20Addr2,
      gasPrice: 1000000,
      gas: 100000, 
      from: sender.address,
      value: 0,
      data: config.erc20.transfer(addr, transferAmount),
    };
    client.providers.ETH.getNonce(tx.from)
    .then((nonce) => {
      tx.nonce = nonce;
      const txObj = new Tx(tx);
      txObj.sign(senderPriv);
      const serTx = txObj.serialize();
      const data = { tx: `0x${serTx.toString('hex')}` };
      client.broadcast('ETH', data, (err, txHash) => {
        assert(err === null, err);
        client.getTx('ETH', txHash, (err, minedTx) => {
          assert(err === null, err);
          assert(minedTx.height > -1);
          done();
        });
      });
    })
    .catch((err) => { throw new Error(err); })
  });

  it('Should transfer some ERC20 (2) tokens to the random address', (done) => {
    const tx = {
      nonce: null,
      to: erc20Addr2,
      gasPrice: 1000000,
      gas: 100000, 
      from: sender.address,
      value: 0,
      data: config.erc20.transfer(randAddr, transferAmount),
    };
    client.providers.ETH.getNonce(tx.from)
    .then((nonce) => {
      tx.nonce = nonce;
      const txObj = new Tx(tx);
      txObj.sign(senderPriv);
      const serTx = txObj.serialize();
      const data = { tx: `0x${serTx.toString('hex')}` };
      client.broadcast('ETH', data, (err, txHash) => {
        assert(err === null, err);
        client.getTx('ETH', txHash, (err, minedTx) => {
          assert(err === null, err);
          assert(minedTx.height > -1);
          done();
        });
      });
    });
  });

  it('Should get the token transfer history for a single token', (done) => {
    client.getTxHistory('ETH', { address: addr, ERC20Token: erc20Addr2 }, (err, txHistory) => {
      assert(err === null, err);
      assert(txHistory.length === 1, `Number of transfers should be 1, but got ${txHistory.length}`);
      assert(txHistory[0].value === transferAmount, 'Transfer amount incorrect.')
      assert(txHistory[0].in === 1, 'Transfer should be inbound, but was not')
      done();
    });
  });

  it('Should get the token transfer history for both tokens', (done) => {
    client.getTxHistory('ETH', { address: addr, ERC20Token: [ erc20Addr, erc20Addr2 ] }, (err, txHistory) => {
      assert(err === null, err);
      assert(txHistory.length === 2, `Number of transfers should be 2, but got ${txHistory.length}`);
      assert(txHistory[0].value === transferAmount, 'Transfer amount incorrect.')
      assert(txHistory[1].value === transferAmount, 'Transfer amount incorrect.')
      assert(txHistory[0].in === 1, 'Transfer should be inbound, but was not')
      assert(txHistory[1].in === 1, 'Transfer should be inbound, but was not')
      done();
    });
  });

  it('Should get the token transfer history for multiple addresses', (done) => {
    client.getTxHistory('ETH', { address: [ addr, randAddr ], ERC20Token: [ erc20Addr, erc20Addr2 ] }, (err, txHistory) => {
      assert(err === null, err);
      assert(txHistory.length === 3, `Number of transfers should be 3, but got ${txHistory.length}`);
      assert(txHistory[0].value === transferAmount, 'Transfer amount incorrect.')
      assert(txHistory[1].value === transferAmount, 'Transfer amount incorrect.')
      assert(txHistory[0].in === 1, 'Transfer should be inbound, but was not')
      assert(txHistory[1].in === 1, 'Transfer should be inbound, but was not')
      done();
    });
  });

  it('Should transfer ETH out of the first agent account', (done) => {
    const req = {
      schemaCode: 'ETH',
      params: {
        nonce: null,
        gasPrice: 100000000,
        gas: 100000,
        to: randAddr,
        value: 10000,
        data: ''
      },
      accountIndex: 0, // corresponds to addr
      sender: addr,    // full address corresponding to accountIndex=0
    }
    client.sign(req, (err, data) => {
      assert(err === null, err);
      // Create a new transaction with the returned signature
      client.broadcast('ETH', data, (err, txHash) => {
        assert(err === null, err);
        client.getTx('ETH', txHash, (err, tx) => {
          assert(err === null, err);
          assert(tx.height > -1, 'Block was not mined');
          assert(tx.timestamp !== undefined);
          assert(tx.from.toLowerCase() === addr.toLowerCase(), `Incorrect signer: got ${tx.from}, expected ${addr}`);
          client.getBalance('ETH', { address: addr }, (err, data) => {
            assert(err === null, err);
            assert(data.balance < balance, 'Balance did not reduce');
            done();
          });
        });
      });
    });
  });

  it('Should transfer the ERC20 token out of the agent account', (done) => {
    const req = {
      schemaCode: 'ETH-ERC20',
      params: {
        nonce: null,
        gasPrice: 100000000,
        gas: 100000,
        to: erc20Addr,
        value: 0,
        data: {
          to: randAddr,
          value: 1
        }
      },
      accountIndex: 0,
      sender: addr,
    };
    client.sign(req, (err, sigData) => {
      assert(err === null, err);
      client.broadcast('ETH', sigData, (err, txHash) => {
        assert(err === null, err);
        client.getTx('ETH', txHash, (err, tx) => {
          assert(err === null, err);
          assert(tx.height > -1, 'Transaction not included in block');
          client.getBalance('ETH', { address: addr }, (err, data) => {
            assert(err === null, err);
            assert(data.nonce > -1);
            done();
          });
        });
      });
    });
  });

  it('Should get a list of tokens and check a balance', (done) => {
    const tokenList = tokens;
    assert(tokenList && Object.keys(tokenList).length > 0);
    done();
  })

  it('Should get the token balance of the first receiving address', (done) => {
    client.getTokenBalance({ address: addr, tokens: [ erc20Addr, erc20Addr2 ] }, (err, res) => {
      assert(err === null, err);
      assert(parseInt(res[erc20Addr]) === transferAmount - 1, `Expected balance of ${transferAmount - 1}, but got ${res[erc20Addr]}`);
      assert(parseInt(res[erc20Addr2]) === transferAmount, `Expected balance of ${transferAmount}, but got ${res[erc20Addr2]}`);
      done();
    })
  })

  it('Should create an automated permission.', (done) => {
    const req = {
      schemaCode: 'ETH',
      timeLimit: 0,
      params: {
        value: { gt: 1, lte: 12000 },
      }
    };
    client.addPermission(req, (err) => {
      assert(err === null, err);
      done();
    });
  });

  it('Should make an automated signature request and broadcast the response in a transaction.', (done) => {
      client.providers.ETH.getNonce(addr)
      .then((nonce) => {
        const req = {
          usePermission: true,
          schemaCode: 'ETH',
          params: {
            nonce,
            gasPrice: 1e9,
            gas: 1e6,
            to: randAddr,
            value: 10000,
            data: '',
          },
          accountIndex: 0
        };
        client.sign(req, (err, sigData) => {
          assert(err === null, err);
          client.broadcast('ETH', sigData, (err, txHash) => {
            assert(err === null, err);
            client.getTx('ETH', txHash, (err, tx) => {
              assert(err === null, err);
              assert(tx.from.toLowerCase() === addr.toLowerCase());
              assert(tx.to.toLowerCase() === randAddr.toLowerCase());
              const expectedVal = req.params.value * Math.pow(10, -18) * -1;
              assert(tx.value === String(expectedVal), `Wrong tx value. Got ${tx.value}, expected ${expectedVal}`);
              done();
            });
          });
        });
      })
      .catch((err) => {
        assert(err === null, err);
      })
  });

  it('Should create an ERC20 permission.', (done) => {
    const req = {
      schemaCode: 'ETH-ERC20',
      timeLimit: 0,
      params: {
        value: {
          'eq': 0,
        },
        data: {
          value: {
            'lte': 120000
          }
        }
      }
    };
    client.addPermission(req, (err) => {
      assert(err === null, err);
      done();
    });
  });

  it('Should make an automated ERC20 transfer.', (done) => {
    client.providers.ETH.getNonce(addr)
    .then((nonce) => {
      const req = {
        schemaCode: 'ETH-ERC20',
        params: {
          nonce,
          gasPrice: 100000000,
          gas: 100000,
          to: erc20Addr,
          value: 0,
          data: {
            to: randAddr,
            value: 1
          }
        },
        accountIndex: 0,
        sender: addr,
      };
      client.sign(req, (err, sigData) => {
        assert(err === null, err);
        client.broadcast('ETH', sigData, (err, txHash) => {
          assert(err === null, err);
          client.getTx('ETH', txHash, (err, tx) => {
            assert(tx.value === 1);
            assert(tx.contractAddress === erc20Addr);
            done();
          });
        });
      });
    })
    .catch((err) => {
      assert(err === null, err);
    })
  });

  it('Should find a permission', (done) => {
    client.permissions((err, permissions) => {
      assert(err === null, err);
      assert(permissions.length === 2);
      assert(permissions[1].schemaCode === 'ETH-ERC20');
      assert(permissions[1].params.data.value.lte === 120000);
      done();
    })
  })

  it('Should create an unstructured transaction', (done) => {
    client.providers.ETH.getNonce(addr)
    .then((nonce) => {
      const data = '0x8f76ccf7000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000010000000000000000000000005c9b369856ee82f72b44ad9fdf331e73c5f071cb0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000249165d4faa2905c3010eb16e8473b617d56b97b0000000000000000000000000000000000000000000000000000000000000001708000000000016400000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001'
      const req = {
        schemaCode: 'ETH-Unstructured',
        params: {
          nonce,
          gasPrice: 10**9,
          gas: 10**6,
          to: `0x${crypto.randomBytes(20).toString('hex')}`,
          value: 0,
          data,
        },
        accountIndex: 0,
        sender: addr,
      };
      // Build tx with ethereumjs-tx
      const txObj = new Tx(req.params);
      txObj.raw = txObj.raw.slice(0, 6);
      txObj._fields = txObj._fields.slice(0, 6);
      const serTx = txObj.serialize();
      const tx = `0x${serTx.toString('hex')}`;
      client.sign(req, (err, sigData) => {
        assert.equal(err, null)
        assert.equal(`0x${sigData.unsignedTx}`, tx, 'Incorrect tx built');
        done();
      })
    })
    .catch((err) => {
      assert.equal(err, null);
    })
  })

});