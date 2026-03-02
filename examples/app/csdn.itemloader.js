// const cheerio = require('cheerio');
// const puppeteer = require('puppeteer');
// const axios = require('axios');


class ItemLoader {
  /**
   * Load items based on a flexible configuration.
   * @param {Object|string} source - The source object, either Puppeteer page or HTML string (Cheerio in Node.js).
   * @param {Object} config - The configuration object for extraction.
   * @param {boolean} isDetailPage  - Flag indicating whether to extract a single object or an array.
   * @param {boolean} useHttp - Flag indicating whether to use HTTP requests for data loading.
   * @returns {Object|Array} - Extracted data object or array of data objects.
   */
  static async parse(source, config = {}, isDetailPage = false, useHttp = null) {
      let hasPuppeteer = typeof globalThis.page____ChromePage____Object !== 'undefined';
      let usePuppeteer = hasPuppeteer;
      if (useHttp) usePuppeteer = false;

      if (!usePuppeteer && typeof source === 'string') {
          source = cheerio.load(source, { decodeEntities: false });
      }

      // 检查配置是否包含 XPath，如果在 Cheerio 模式下使用 XPath，给出警告
      if (!usePuppeteer && this.containsXPath(config)) {
          console.warn("配置中包含 XPath，但当前使用 Cheerio 模式，XPath 不受支持。请使用 CSS 选择器。");
          return null;
      }

      console.log('parse:', { usePuppeteer, hasPuppeteer, useHttp });
      const extractedData = await this.extractData(source, config, usePuppeteer);

      if (extractedData.length === 0) {
          console.warn("ItemLoader 没有找到匹配的数据。");
          return null; // 或返回 []，取决于需求
      }
      return isDetailPage && extractedData.length === 1 ? extractedData[0] : extractedData;
  }

  static ensureArray(data) {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (typeof data === 'object' && Object.keys(data).length > 0) return [data];
      return [];
  }

  /**
   * 检查配置中是否包含 XPath
   * @param {Object} config - 配置对象
   * @returns {boolean} - 是否包含 XPath
   */
  static containsXPath(config) {
      const check = (obj) => {
          for (const value of Object.values(obj)) {
              if (typeof value === 'string' && value.startsWith('//')) return true;
              if (Array.isArray(value)) return value.some(v => typeof v === 'string' && v.startsWith('//'));
              if (typeof value === 'object' && value !== null) return check(value);
          }
          return false;
      };
      return check(config);
  }

  /**
   * Extract data based on a single configuration.
   * @param {Object} source - The source object, either Cheerio object ($) or Puppeteer page.
   * @param {Object} config - Configuration object for a single item.
   * @param {boolean} usePuppeteer - Flag to determine if Puppeteer is being used.
   * @returns {Array} - Array of extracted data objects.
   */
  static async extractData(source, config, usePuppeteer) {
      console.log("ItemLoader.extractData, usePuppeteer:", usePuppeteer);
      if (!usePuppeteer) {
          return this.cheerioExtract(source, config);
      } else {
          const puppeteerPage = globalThis.page____ChromePage____Object;
          return await puppeteerPage.evaluate(function(config) {
              let getDataByConfig = function(config) {
                  const listSelector = config._listContainer;
                  delete config._listContainer;
                  let listContainer;

                  if (!listSelector) {
                      return extractItemData(document, config);
                  }

                  listContainer = document.querySelector(listSelector);
                  if (!listContainer) return [];

                  let itemContainers = Array.from(listContainer.children);
                  return itemContainers.map(container => extractItemData(container, config));
              }

              let extractItemData = function(container, itemConfig) {
                  const itemData = {};
                  const keys = Object.keys(itemConfig);
                  for (const key of keys) {
                      const selector = itemConfig[key];
                      if (typeof selector === 'string') {
                          itemData[key] = extractItemValue(container, selector);
                      } else if (typeof selector === 'object') {
                          itemData[key] = extractItemData(container, selector);
                      }
                  }
                  return itemData;
              }

              let extractItemValue = function(container, selectorXPath) {
                  let [selector, explicitAttr] = String(selectorXPath).trim().split('::');
                  selector = selector.trim();
                  const isXPath = selector.startsWith('//');
                  const elements = getElements(container, selector, isXPath);
                  if (elements.length === 0) return '';
                  let datas = elements.map(element => getElement(element, explicitAttr) || '');
                  if (datas.length === 0) return '';
                  return datas.length === 1 ? datas[0] : datas;
              }

              let getElements = function(context, selector, isXPath = false) {
                  if (isXPath) {
                      const xPathResult = document.evaluate(selector, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                      const nodes = [];
                      for (let i = 0; i < xPathResult.snapshotLength; i++) {
                          nodes.push(xPathResult.snapshotItem(i));
                      }
                      return nodes;
                  } else {
                      return Array.from(context.querySelectorAll(selector));
                  }
              }

              let getElement = function(element, attr) {
                  if (element.nodeType === Node.ATTRIBUTE_NODE) return element.value;
                  if (!element) return '';
                  if (attr === 'innerHTML') return element.innerHTML || '';
                  if (attr === 'outerHTML') return element.outerHTML || '';

                  const tagName = element.tagName ? element.tagName.toLowerCase() : '';
                  if (!attr) {
                      if (tagName === 'a') return element.innerText.trim() || element.getAttribute('href');
                      if (['img', 'video', 'audio'].includes(tagName)) return element.getAttribute('src') || '';
                      return element.textContent ? element.textContent.trim() : '';
                  }

                  let result = element.getAttribute(attr);
                  if (!result && attr === 'innerText' && element.textContent) {
                      result = element.textContent.trim();
                  }
                  return result || '';
              };
              return getDataByConfig(config);
          }, config);
      }
  }

  static cheerioExtract($, config) {
      console.log('cheerioExtract in');
      const listSelector = config._listContainer;
      delete config._listContainer;

      let results = [];

      if (listSelector) {
          const listContainer = $(listSelector);
          console.log('List container found:', listContainer.length > 0);
          if (listContainer.length === 0) {
              console.warn("List container not found");
              return [];
          }
          results = listContainer.children().map((_, item) => this.extractItemData($, $(item), config)).get();
      } else {
          results = [this.extractItemData($, $.root(), config)];
      }

      console.log('Extracted results:', results);
      return results;
  }

  static extractItemData($, container, itemConfig) {
      const itemData = {};
      for (const [key, selector] of Object.entries(itemConfig)) {
          if (typeof selector === 'string') {
              itemData[key] = this.extractItemValue($, container, selector);
          } else if (typeof selector === 'object') {
              itemData[key] = this.extractItemData($, container, selector);
          }
      }
      return itemData;
  }

  static extractItemValue($, container, selectorAttr) {
      const [selector, explicitAttr] = selectorAttr.split('::').map(s => s.trim());

      if (selector.startsWith('//')) {
          console.warn('XPath is not supported in Cheerio mode:', selector);
          return '';
      }

      let elements = container.find(selector);
      console.log(`Selector "${selector}" matched ${elements.length} elements`);

      // 如果没有匹配到元素，尝试更宽松的匹配（仅保留核心标签）
      if (elements.length === 0) {
          const looseSelector = selector.split(' ').map(part => {
              if (part.startsWith('[class*="')) return part; // 保留 contains 选择器
              return part.replace(/\..*/g, ''); // 移除类名部分，只保留标签
          }).join(' ');
          elements = container.find(looseSelector);
          console.log(`Loose selector "${looseSelector}" matched ${elements.length} elements`);
      }

      if (elements.length === 0) return '';

      const getValue = (el) => {
          const $el = $(el);
          if (explicitAttr === 'outerHTML') return $.html($el) || '';
          if (explicitAttr === 'innerHTML') return $el.html() || '';
          if (explicitAttr) return $el.attr(explicitAttr) || '';

          const tagName = $el.prop('tagName') ? $el.prop('tagName').toLowerCase() : '';
          if (tagName === 'a') return $el.text().trim() || $el.attr('href') || '';
          if (['img', 'video', 'audio'].includes(tagName)) return $el.attr('src') || '';
          return $el.text().trim() || '';
      };

      const values = elements.map((_, el) => getValue(el)).get();
      return values.length === 1 ? values[0] : values;
  }
}

// Your provided configuration
const itemConfig = {
  _listContainer: "div.file-content",
  title: 'a.title',
  description: 'div.desc',
  url: 'a.title::href',
  price: 'span.price',
  countInfo: 'span.text.ml-24',
  author: 'span.text.flex-1',
};

// Implementation using Cheerio (simpler approach)
async function parseWithCheerio(url) {
  try {
    // Fetch HTML content
    const response = await axios.get(url);
    const html = response.data;
    
    // Parse using ItemLoader
    const results = await ItemLoader.parse(html, itemConfig);
    
    console.log('Extracted data:', JSON.stringify(results, null, 2));
    return results;
  } catch (error) {
    console.error('Error in Cheerio parsing:', error.message);
    return null;
  }
}


// Execute parsing
async function main() {
  const targetUrl = 'https://download.csdn.net/list/blog/1-0-0-0-1-1.html';
  
  console.log('Parsing with Cheerio:');
  await parseWithCheerio(targetUrl);
  
}
console.log('start')
main().catch(console.error);