// the Uniswap Default token list lives here
export const DEFAULT_TOKEN_LIST_URL =
  'https://raw.githubusercontent.com/b-u-i-d-l/WIMD-uniswap/ITEMswap/src/constants/ethItemLists/dist/tokensList.json'

const dynamicListOfLists: string[] = [DEFAULT_TOKEN_LIST_URL]

function extractAddressBarParams() {
  const search: any = {}
  try {
    let splits: any = ''
    if (window.location.href.indexOf('?') !== -1) {
      splits = window.location.href.substring(window.location.href.indexOf('?'))
    }
    splits = splits.split('?')
    for (const z in splits) {
      let split: any = splits[z].trim()
      if (split.length === 0) {
        continue
      }
      split = split.split('&')
      for (const i in split) {
        let data = split[i].trim()
        if (data.length === 0) {
          continue
        }
        data = data.split('=')
        data[1] = window.decodeURIComponent(data[1])
        if (!search[data[0]]) {
          search[data[0]] = data[1]
        } else {
          let value = search[data[0]]
          if (typeof value !== 'object') {
            value = [value]
          }
          value.push(data[1])
          search[data[0]] = value
        }
      }
    }
  } catch (e) {}
  return search
}

const addressBarParams: any = extractAddressBarParams()
addressBarParams.tokensList && dynamicListOfLists.push(addressBarParams.tokensList)

export const DEFAULT_LIST_OF_LISTS = dynamicListOfLists
