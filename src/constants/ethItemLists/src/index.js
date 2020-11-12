(require('dotenv')).config();
require('./utils');
var fs = require('fs');
var path = require('path');

window.context.blockchainConnectionString = window.context.blockchainConnectionString || process.env.BLOCKCHAIN_CONNECTION_STRING;

function cleanPath(path) {
    try {
        fs.rmdirSync(path, { recursive: true });
    } catch (e) {
        console.error(e);
    }
    try {
        fs.mkdirSync(path, { recursive: true });
    } catch (e) {
        console.error(e);
    }
}

async function start() {
    await loadEnvironment();
    await loop();
}

async function loop() {
    var distPath = path.resolve(__dirname, "../dist");
    cleanPath(distPath);
    var collections = await loadCollections();
    var tokenLists = {};
    var addToTokenLists = function addToTokenLists(key, value) {
        tokenLists[key] = value;
    };
    await Promise.all(collections.map(collection => elaborateCollection(collection, addToTokenLists)));
    var p = path.resolve(distPath, "tokensList.json");
    fs.writeFileSync(p, JSON.stringify(Object.keys(tokenLists).map(it => window.context.listURITemplate.format(it)), null, 4));
    for(var entry of Object.entries(tokenLists)) {
        var p = path.resolve(distPath, `${entry[0]}.json`);
        fs.writeFileSync(p, JSON.stringify(entry[1], null, 4));
    }
    window.context.loopTimeout && setTimeout(loop, window.context.loopTimeout);
}

async function elaborateCollection(collection, callback) {
    await loadItems(collection);
    if(!collection.items || Object.values(collection.items).length === 0) {
        return;
    }
    var cleanCollection = {
        name : collection.name.split('"').join(""),
        keywords : [],
        tags : {},
        logoURI : window.formatLinkForExpose(await getLogoURI(collection)),
        tokens : [],
        version : {
            major: window.asNumber(collection.standardVersion),
            minor: window.asNumber(collection.interoperableInterfaceModelVersion),
            patch: window.asNumber(collection.modelVersion)
        },
        timestamp: new Date().toISOString()
    };
    for(var rawItem of Object.values(collection.items)) {
        cleanCollection.tokens.push({
            address : rawItem.address,
            name : rawItem.name.split('"').join(""),
            symbol : rawItem.symbol.split('"').join(""),
            decimals : window.asNumber(rawItem.decimals),
            chainId : window.asNumber(window.networkId),
            logoURI : window.formatLinkForExpose(await getLogoURI(rawItem))
        });
    }
    callback(collection.address, cleanCollection);
}

async function getLogoURI(element) {
    try {
        await window.AJAXRequest(element.trustWalletURI);
        element.image = element.trustWalletURI;
    } catch(e) {
    }
    try {
        await window.AJAXRequest(element.image);
        return element.image;
    } catch(e) {
    }
    return getDefaultLogoURI(element);
}

function getDefaultLogoURI(element) {
    return window.context.logoURITemplate.format(element.category || element.collection.category, element.collection ? "item" : "collection");
};

async function loadEnvironment() {
    await window.onEthereumUpdate(0);
    window.ethItemOrchestrator = window.newContract(window.context.ethItemOrchestratorABI, window.getNetworkElement("ethItemOrchestratorAddress"));
    try {
        window.currentEthItemKnowledgeBase = window.newContract(window.context.KnowledgeBaseABI, await window.blockchainCall(window.ethItemOrchestrator.methods.knowledgeBase));
    } catch (e) {}
    try {
        window.currentEthItemFactory = window.newContract(window.context.IEthItemFactoryABI, await window.blockchainCall(window.ethItemOrchestrator.methods.factory));
    } catch (e) {}
    try {
        window.currentEthItemERC20Wrapper = window.newContract(window.context.W20ABI, await window.blockchainCall(window.currentEthItemKnowledgeBase.methods.erc20Wrapper));
    } catch (e) {}
};

async function loadCollections() {
    var map = {};
    Object.entries(window.context.ethItemFactoryEvents).forEach(it => map[window.web3.utils.sha3(it[0])] = it[1]);
    var topics = [Object.keys(map)];
    var address = await window.blockchainCall(window.ethItemOrchestrator.methods.factories);
    var collections = [];
    var blocks = await window.loadBlockSearchTranches();
    var updateSubCollectionsPromise = function updateSubCollectionsPromise(subCollections) {
        return new Promise(function(ok, ko) {
            collections.push(...subCollections);
            refreshCollectionData(subCollections).then(ok).catch(ko)
        });
    }
    var subCollectionsPromises = [];
    for (var block of blocks) {
        var subCollections = [];
        var logs = await window.getLogs({
            address,
            topics,
            fromBlock: block[0],
            toBlock: block[1]
        });
        for (var log of logs) {
            var modelAddress = window.web3.eth.abi.decodeParameter("address", log.topics[1]);
            var collectionAddress = window.web3.utils.toChecksumAddress(window.web3.eth.abi.decodeParameter("address", log.topics[log.topics.length - 1]));
            var category = map[log.topics[0]];
            subCollections.push(window.packCollection(collectionAddress, category, modelAddress));
        }
        subCollectionsPromises.push(updateSubCollectionsPromise(subCollections));
    }
    await Promise.all(subCollectionsPromises);
    return collections;
};

async function refreshCollectionData(collections) {
    var promises = [];
    for (var collection of collections) {
        promises.push(window.refreshSingleCollection(collection));
    }
    await Promise.all(promises);
};

async function loadItems(collection) {
    var collectionObjectIds = await window.loadCollectionItems(collection.address);
    for (var objectId of collectionObjectIds) {
        await window.loadItemData({
            objectId,
            collection
        });
    }
}

start().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(-1);
});