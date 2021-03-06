require('dotenv').config()
require('./utils')
const fs = require('fs')
const path = require('path')
const createClient = require('ipfs-http-client')
window.ipfs = createClient({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' })

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

let elementImages = {}

const elementImagesPath = path.resolve(__dirname, '../dist/elementImages.json')
const metadatasPath = path.resolve(__dirname, '../dist/metadatas.json')

try {
  elementImages = JSON.parse(fs.readFileSync(elementImagesPath, 'UTF-8'))
} catch (e) {
  elementImages = {}
}

try {
  window.metadatas = JSON.parse(fs.readFileSync(metadatasPath, 'UTF-8'))
} catch (e) {
  window.metadatas = {}
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
  await Promise.all(collections.map(collection => elaborateCollection(collection, addToTokenLists)))
  const p = path.resolve(distPath, 'tokensList.json')
  fs.writeFileSync(p, JSON.stringify(tokenLists, null, 4))
  /*fs.writeFileSync(p, JSON.stringify(Object.keys(tokenLists).map(it => window.context.listURITemplate.format(it)), null, 4));
      for(var entry of Object.entries(tokenLists)) {
          var p = path.resolve(distPath, `${entry[0]}.json`);
          fs.writeFileSync(p, JSON.stringify(entry[1], null, 4));
      }*/
  fs.writeFileSync(elementImagesPath, JSON.stringify(elementImages, null, 4))
  fs.writeFileSync(metadatasPath, JSON.stringify(window.metadatas, null, 4))
  window.context.loopTimeout && setTimeout(loop, window.context.loopTimeout)
}

async function elaborateCollection(collection, callback) {
  await loadItems(collection)
  if (!collection.items || Object.values(collection.items).length === 0) {
    return
  }
  const cleanCollection = {
    name: window
      .shortenWord(collection.name.replace(/[^a-zA-Z0-9+/ ]/gi, '').trim(), window.context.tokenListWordLimit, true)
      .trim(),
    keywords: [],
    tags: {},
    tokens: [],
    version: {
      major: window.asNumber(collection.standardVersion),
      minor: window.asNumber(collection.interoperableInterfaceModelVersion),
      patch: window.asNumber(collection.modelVersion)
    },
    timestamp: new Date().toISOString()
  }
  cleanCollection.name = cleanCollection.name || '-'
  cleanCollection.logoURI = window.formatLinkForExpose(await getLogoURI(collection))
  for (const rawItem of Object.values(collection.items)) {
    if (exceptFor.indexOf(window.web3.utils.toChecksumAddress(rawItem.address)) !== -1) {
      continue
    }
    const token = {
      address: rawItem.address,
      name: window
        .shortenWord(rawItem.name.replace(/[^a-zA-Z0-9+/ ]/gi, '').trim(), window.context.tokenListWordLimit, true)
        .trim(),
      symbol: window
        .shortenWord(rawItem.symbol.replace(/[^a-zA-Z0-9+/]/gi, '').trim(), window.context.tokenListWordLimit, true)
        .trim(),
      decimals: window.asNumber(rawItem.decimals),
      chainId: window.asNumber(window.networkId)
    }
    token.name = token.name || '-'
    token.symbol = token.symbol.split(' ').join('') || '-'
    token.logoURI = window.formatLinkForExpose(await getLogoURI(rawItem))
    cleanCollection.tokens.push(token)
  }
  callback(cleanCollection.tokens)
}

async function getLogoURI(element) {
  console.log(element.address, element.image, element.metadataLink, JSON.stringify(element.metadata))
  if (elementImages[element.address]) {
    return (element.image = elementImages[element.address])
  }
  try {
    await window.AJAXRequest(element.trustWalletURI)
    element.image = element.trustWalletURI
  } catch (e) {}

  if (window.mustBeUploadedToIPFS(element.image)) {
    try {
      await window.AJAXRequest(element.image)
      return await uploadToIPFS(element)
    } catch (e) {
      element.objectId && console.log(element.address, element.image)
      element.objectId && console.error(e)
    }
    return element.image
  }
  element.address.toLowerCase() === '0x9b16e70797276Ae1bE23874961D1E6a9698e1EC6' &&
    console.log(element.address, element.image, element.metadataLink, JSON.stringify(element.metadata))
  element.image = element.image ? window.formatLink(element.image) : getDefaultLogoURI(element)
  if(element.image.startsWith('//data')) {
    element.image = element.image.susbstring(2)
  }
  return element.image
}

function getDefaultLogoURI(element) {
  return window.context.logoURITemplate.format(
    element.category || element.collection.category,
    element.collection ? 'item' : 'collection'
  )
}

function uploadToIPFS(element) {
  return new Promise(async function(ok, ko) {
    const timeoutCall = setTimeout(async function() {
      await window.sleep(7000)
      return ok(getDefaultLogoURI(element))
    }, window.context.requestTimeout || 7000)
    const request = require('request').defaults({ encoding: null })
    request.get(element.image, async function(error, response, body) {
      clearTimeout(timeoutCall)
      if (!error && response.statusCode == 200) {
        try {
          const { cid } = await window.ipfs.add(body)
          await window.sleep(5000)
          return ok((elementImages[element.address] = window.context.ipfsUrlChanger + cid))
        } catch (e) {
          return ko(e)
        }
      } else {
        return ko(error || response.statusCode)
      }
    })
  })
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
  const itemContext = await window.AJAXRequest(window.context.itemsContextURL)
  window.excludingCollections = (itemContext.excludingCollections || []).map(it =>
    window.web3.utils.toChecksumAddress(it)
  )
  try {
    window.excludingCollections.push(
      ...itemContext.pandorasBox
        .map(it => window.web3.utils.toChecksumAddress(it))
        .filter(it => window.excludingCollections.indexOf(it) === -1)
    )
  } catch (e) {}
  try {
    const pandorasBox = await window.AJAXRequest(itemContext.pandorasBoxURL)
    window.excludingCollections.push(
      ...pandorasBox
        .map(it => window.web3.utils.toChecksumAddress(it))
        .filter(it => window.excludingCollections.indexOf(it) === -1)
    )
  } catch (e) {}
  const map = {}
  Object.entries(window.context.ethItemFactoryEvents).forEach(it => (map[window.web3.utils.sha3(it[0])] = it[1]))
  const topics = [[Object.keys(map).filter(key => map[key].indexOf('721') === -1)]]
  topics.push([
    Object.keys(map).filter(key => map[key].indexOf('721') !== -1),
    [],
    [window.web3.eth.abi.encodeParameter('uint256', '2'),
    window.web3.eth.abi.encodeParameter('uint256', '3')]
  ])
  const addresses = await window.blockchainCall(window.ethItemOrchestrator.methods.factories)
  const list = (window.getNetworkElement('additionalFactories') || []).map(it =>
    window.web3.utils.toChecksumAddress(it)
  )
  const address = [...addresses, ...list.filter(it => addresses.indexOf(it) === -1)]
  const blocks = await window.loadBlockSearchTranches()
  const subCollectionsPromises = []
  for (const block of blocks) {
    const logs = []
    for (const topic of topics) {
      logs.push(
        ...(await window.getLogs({
          address,
          topics: topic,
          fromBlock: block[0],
          toBlock: block[1]
        }))
      )
    }
    for (const log of logs) {
      const modelAddress = window.web3.eth.abi.decodeParameter('address', log.topics[1])
      const collectionAddress = window.web3.utils.toChecksumAddress(
        window.web3.eth.abi.decodeParameter('address', log.topics[log.topics.length - 1])
      )
      if (window.excludingCollections.indexOf(collectionAddress) !== -1) {
        continue
      }
      const category = map[log.topics[0]]
      subCollectionsPromises.push(
        window
          .refreshSingleCollection(window.packCollection(collectionAddress, category, modelAddress))
          .catch(console.error)
      )
    }
  }
  return await Promise.all(subCollectionsPromises)
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
