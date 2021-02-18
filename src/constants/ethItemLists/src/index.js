require('dotenv').config()
require('./utils')
const fs = require('fs')
const path = require('path')

window.context.blockchainConnectionString =
  window.context.blockchainConnectionString || process.env.BLOCKCHAIN_CONNECTION_STRING

let exceptFor

function cleanPath(path) {
  try {
    fs.rmdirSync(path, { recursive: true })
  } catch (e) {
    console.error(e)
  }
  try {
    fs.mkdirSync(path, { recursive: true })
  } catch (e) {
    console.error(e)
  }
}

async function start() {
  await loadEnvironment()
  await loop()
}

async function loop() {
  const distPath = path.resolve(__dirname, '../dist')
  cleanPath(distPath)
  const collections = await loadCollections()
  const tokenLists = {
    name: window
      .shortenWord('EthItem Tokens List', window.context.tokenListWordLimit)
      .replace(/[^\w\s]/gi, '')
      .trim(),
    keywords: [],
    tags: {},
    logoURI: window.context.collectionLogoURI,
    tokens: [],
    version: {
      major: 1,
      minor: 0,
      patch: 0
    },
    timestamp: new Date().toISOString()
  }
  const addToTokenLists = function addToTokenLists(tokens) {
    tokenLists.tokens.push(...tokens)
  }
  console.log('Elaborating collections...')
  await Promise.all(collections.map(collection => elaborateCollection(collection, addToTokenLists)))
  console.log('Elaboration done')
  const p = path.resolve(distPath, 'tokensList.json')
  fs.writeFileSync(p, JSON.stringify(tokenLists, null, 4))
  /*fs.writeFileSync(p, JSON.stringify(Object.keys(tokenLists).map(it => window.context.listURITemplate.format(it)), null, 4));
    for(var entry of Object.entries(tokenLists)) {
        var p = path.resolve(distPath, `${entry[0]}.json`);
        fs.writeFileSync(p, JSON.stringify(entry[1], null, 4));
    }*/
  window.context.loopTimeout && setTimeout(loop, window.context.loopTimeout)
}

async function elaborateCollection(collection, callback) {
  await loadItems(collection)
  if (!collection.items || Object.values(collection.items).length === 0) {
    return
  }
  const cleanCollection = {
    name: window
      .shortenWord(collection.name, window.context.tokenListWordLimit)
      .replace(/[^\w\s]/gi, '')
      .trim(),
    keywords: [],
    tags: {},
    logoURI: window.formatLinkForExpose(await getLogoURI(collection)),
    tokens: [],
    version: {
      major: window.asNumber(collection.standardVersion),
      minor: window.asNumber(collection.interoperableInterfaceModelVersion),
      patch: window.asNumber(collection.modelVersion)
    },
    timestamp: new Date().toISOString()
  }
  for (const rawItem of Object.values(collection.items)) {
    if (exceptFor.indexOf(window.web3.utils.toChecksumAddress(rawItem.address)) !== -1) {
      continue
    }
    cleanCollection.tokens.push({
      address: rawItem.address,
      name: window
        .shortenWord(rawItem.name, window.context.tokenListWordLimit)
        .replace(/[^\w\s]/gi, '')
        .trim(),
      symbol: window
        .shortenWord(rawItem.symbol, window.context.tokenListWordLimit)
        .replace(/[^\w\s]/gi, '')
        .trim(),
      decimals: window.asNumber(rawItem.decimals),
      chainId: window.asNumber(window.networkId),
      logoURI: window.formatLinkForExpose(await getLogoURI(rawItem))
    })
  }
  callback(cleanCollection.tokens)
}

async function getLogoURI(element) {
  try {
    await window.AJAXRequest(element.trustWalletURI)
    element.image = element.trustWalletURI
  } catch (e) {}
  try {
    await window.AJAXRequest(element.image)
    return element.image
  } catch (e) {}
  return getDefaultLogoURI(element)
}

function getDefaultLogoURI(element) {
  return window.context.logoURITemplate.format(
    element.category || element.collection.category,
    element.collection ? 'item' : 'collection'
  )
}

async function loadEnvironment() {
  await window.onEthereumUpdate(0)
  exceptFor = exceptFor || (window.context.exceptFor || []).map(it => window.web3.utils.toChecksumAddress(it))
  window.ethItemOrchestrator = window.newContract(
    window.context.ethItemOrchestratorABI,
    window.getNetworkElement('ethItemOrchestratorAddress')
  )
  try {
    window.currentEthItemKnowledgeBase = window.newContract(
      window.context.KnowledgeBaseABI,
      await window.blockchainCall(window.ethItemOrchestrator.methods.knowledgeBase)
    )
  } catch (e) {}
  try {
    window.currentEthItemFactory = window.newContract(
      window.context.IEthItemFactoryABI,
      await window.blockchainCall(window.ethItemOrchestrator.methods.factory)
    )
  } catch (e) {}
  try {
    window.currentEthItemERC20Wrapper = window.newContract(
      window.context.W20ABI,
      await window.blockchainCall(window.currentEthItemKnowledgeBase.methods.erc20Wrapper)
    )
  } catch (e) {}
}

async function loadCollections() {
  const map = {}
  Object.entries(window.context.ethItemFactoryEvents).forEach(it => (map[window.web3.utils.sha3(it[0])] = it[1]))
  const topics = [Object.keys(map)]
  const addresses = await window.blockchainCall(window.ethItemOrchestrator.methods.factories)
  const list = (window.getNetworkElement("additionalFactories") || []).map(it => window.web3.utils.toChecksumAddress(it))
  const address = [...addresses, ...list.filter(it => addresses.indexOf(it) === -1)]
  const collections = []
  const blocks = await window.loadBlockSearchTranches()
  const updateSubCollectionsPromise = function updateSubCollectionsPromise(subCollections) {
    collections.push(...subCollections)
    return Promise.all(subCollections.map(it => window.refreshSingleCollection(it)))
  }
  const subCollectionsPromises = []
  for (const block of blocks) {
    console.log(block[0], '-', block[1])
    const subCollections = []
    const logs = await window.getLogs({
      address,
      topics,
      fromBlock: block[0],
      toBlock: block[1]
    })
    for (const log of logs) {
      const modelAddress = window.web3.eth.abi.decodeParameter('address', log.topics[1])
      const collectionAddress = window.web3.utils.toChecksumAddress(
        window.web3.eth.abi.decodeParameter('address', log.topics[log.topics.length - 1])
      )
      const category = map[log.topics[0]]
      subCollections.push(window.packCollection(collectionAddress, category, modelAddress))
    }
    subCollectionsPromises.push(updateSubCollectionsPromise(subCollections))
  }
  await Promise.all(subCollectionsPromises)
  return collections
}

async function loadItems(collection) {
  const collectionObjectIds = await window.loadCollectionItems(collection.address)
  for (const objectId of collectionObjectIds) {
    await window.loadItemData({
      objectId,
      collection
    })
  }
}

start()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(-1)
  })
