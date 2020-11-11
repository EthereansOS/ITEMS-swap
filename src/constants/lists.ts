// the Uniswap Default token list lives here
export const DEFAULT_TOKEN_LIST_URL = 'https://raw.githubusercontent.com/b-u-i-d-l/WIMD-uniswap/master/wimdlist.json'

var dynamicListOfLists : string[] = [
  DEFAULT_TOKEN_LIST_URL
]

function extractAddressBarParams() {
  var search :any = {};
  try {
      var splits :any = "";
      if(window.location.href.indexOf("?") !== -1) {
        splits = window.location.href.substring(window.location.href.indexOf("?"));
      }
      splits = splits.split('?');
      for (var z in splits) {
          var split :any = splits[z].trim();
          if (split.length === 0) {
              continue;
          }
          split = split.split('&');
          for (var i in split) {
              var data = split[i].trim();
              if (data.length === 0) {
                  continue;
              }
              data = data.split('=');
              data[1] = window.decodeURIComponent(data[1]);
              if (!search[data[0]]) {
                  search[data[0]] = data[1];
              } else {
                  var value = search[data[0]];
                  if (typeof value !== 'object') {
                      value = [value];
                  }
                  value.push(data[1]);
                  search[data[0]] = value;
              }
          }
      }
  } catch (e) {}
  return search;
};

var addressBarParams : any = extractAddressBarParams();
addressBarParams.tokensList && dynamicListOfLists.push(addressBarParams.tokensList);

try {
  require("./ethItemLists/ethItemLists.json").forEach((list :string) => dynamicListOfLists.push(list));
} catch(e) {
}

export const DEFAULT_LIST_OF_LISTS = dynamicListOfLists