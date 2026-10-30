"use strict";
var OpenDeskSupportBusinessDomain = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // desktop/business-validator-entry.ts
  var business_validator_entry_exports = {};
  __export(business_validator_entry_exports, {
    parseBackup: () => parseBusinessBackup
  });

  // fixtures/products-demo.json
  var products_demo_default = {
    schemaVersion: 1,
    format: "opendesk.ai-customer-support.products-demo",
    demo: true,
    description: "\u5B8C\u5168\u865A\u6784\u7684\u5546\u54C1\u4E0E\u56FE\u7247\u793A\u4F8B\u6570\u636E\uFF1B\u4EF7\u683C\u4EC5\u4E3A\u6F14\u793A\u53C2\u8003\u4EF7\uFF0C\u56FE\u7247\u4E3A\u7A0B\u5E8F\u7ED8\u5236 SVG \u793A\u610F\u56FE\uFF0C\u4E0D\u53CD\u6620\u5B9E\u65F6\u552E\u4EF7\u3001\u5E93\u5B58\u6216\u627F\u8BFA\u3002",
    provider: "local-demo",
    products: [
      {
        id: "demo-jacket",
        sku: "OD-JK-101",
        name: "\u8F7B\u91CF\u8FDE\u5E3D\u5916\u5957",
        category: "\u670D\u9970",
        price: "\xA5299",
        model: "JK-101",
        summary: "\u8F7B\u91CF\u65E5\u5E38\u5916\u5957\uFF0C\u5C55\u793A\u53EF\u53C2\u8003\u7684\u989C\u8272\u4E0E\u5C3A\u7801\u4FE1\u606F\u3002",
        specs: [
          {
            label: "\u989C\u8272",
            value: "\u6D77\u519B\u84DD"
          },
          {
            label: "\u5C3A\u7801",
            value: "S / M / L / XL"
          },
          {
            label: "\u9762\u6599",
            value: "\u6F14\u793A\u805A\u916F\u7EA4\u7EF4"
          }
        ],
        imageType: "jacket",
        color: "#426894",
        images: [
          {
            id: "front",
            label: "\u6B63\u9762\u793A\u610F\u56FE"
          },
          {
            id: "detail",
            label: "\u6750\u8D28\u7EC6\u8282\u793A\u610F"
          }
        ],
        source: "demo/products-demo.json",
        updated: "2026-10-28"
      },
      {
        id: "demo-shoes",
        sku: "OD-SN-202",
        name: "\u8F7B\u91CF\u8FD0\u52A8\u978B",
        category: "\u978B\u9774",
        price: "\xA5359",
        model: "SN-202",
        summary: "\u9002\u5408\u65E5\u5E38\u51FA\u884C\u7684\u8FD0\u52A8\u978B\u6F14\u793A\u6B3E\uFF0C\u5177\u4F53\u811A\u611F\u4E0E\u5C3A\u7801\u9700\u5B9E\u7269\u6838\u5B9E\u3002",
        specs: [
          {
            label: "\u989C\u8272",
            value: "\u5CA9\u7070"
          },
          {
            label: "\u5C3A\u7801",
            value: "36\u201344\uFF08\u6F14\u793A\uFF09"
          },
          {
            label: "\u978B\u9762",
            value: "\u900F\u6C14\u7EC7\u7269\uFF08\u6F14\u793A\uFF09"
          }
        ],
        imageType: "shoe",
        color: "#728491",
        images: [
          {
            id: "side",
            label: "\u4FA7\u9762\u793A\u610F\u56FE"
          },
          {
            id: "detail",
            label: "\u978B\u9762\u7EC6\u8282\u793A\u610F"
          }
        ],
        source: "demo/products-demo.json",
        updated: "2026-10-28"
      },
      {
        id: "demo-bottle",
        sku: "OD-CU-303",
        name: "\u4FBF\u643A\u4FDD\u6E29\u676F",
        category: "\u5BB6\u5C45",
        price: "\xA5129",
        model: "CU-303",
        summary: "\u8F7B\u4FBF\u676F\u578B\u4E0E\u57FA\u7840\u5BB9\u91CF\u6F14\u793A\uFF0C\u4FDD\u6E29\u65F6\u957F\u4E0D\u4F5C\u771F\u5B9E\u627F\u8BFA\u3002",
        specs: [
          {
            label: "\u5BB9\u91CF",
            value: "480 mL\uFF08\u6F14\u793A\uFF09"
          },
          {
            label: "\u989C\u8272",
            value: "\u96FE\u84DD"
          },
          {
            label: "\u676F\u8EAB",
            value: "\u53CC\u5C42\u7ED3\u6784\u793A\u610F"
          }
        ],
        imageType: "bottle",
        color: "#619ab2",
        images: [
          {
            id: "front",
            label: "\u5916\u89C2\u793A\u610F\u56FE"
          },
          {
            id: "detail",
            label: "\u676F\u76D6\u7EC6\u8282\u793A\u610F"
          }
        ],
        source: "demo/products-demo.json",
        updated: "2026-10-28"
      },
      {
        id: "demo-speaker",
        sku: "OD-SP-404",
        name: "\u8FF7\u4F60\u84DD\u7259\u97F3\u7BB1",
        category: "\u6570\u7801",
        price: "\xA5239",
        model: "SP-404",
        summary: "\u4FBF\u643A\u97F3\u7BB1\u5916\u89C2\u4E0E\u63A7\u5236\u533A\u793A\u610F\uFF0C\u7EED\u822A\u548C\u8FDE\u63A5\u53C2\u6570\u9700\u8FDB\u4E00\u6B65\u6838\u5B9E\u3002",
        specs: [
          {
            label: "\u8FDE\u63A5",
            value: "\u84DD\u7259\uFF08\u6F14\u793A\uFF09"
          },
          {
            label: "\u914D\u8272",
            value: "\u77F3\u58A8\u9ED1"
          },
          {
            label: "\u63A5\u53E3",
            value: "USB-C \u793A\u610F"
          }
        ],
        imageType: "speaker",
        color: "#4f606f",
        images: [
          {
            id: "front",
            label: "\u6B63\u9762\u793A\u610F\u56FE"
          },
          {
            id: "detail",
            label: "\u6309\u952E\u7EC6\u8282\u793A\u610F"
          }
        ],
        source: "demo/products-demo.json",
        updated: "2026-10-28"
      },
      {
        id: "demo-bag",
        sku: "OD-BG-505",
        name: "\u7B80\u7EA6\u5E06\u5E03\u6258\u7279\u5305",
        category: "\u914D\u9970",
        price: "\xA5159",
        model: "BG-505",
        summary: "\u65E5\u5E38\u901A\u52E4\u5305\u578B\u793A\u610F\uFF0C\u5C3A\u5BF8\u548C\u5B9E\u9645\u627F\u91CD\u5E94\u4EE5\u6838\u9A8C\u8D44\u6599\u4E3A\u51C6\u3002",
        specs: [
          {
            label: "\u989C\u8272",
            value: "\u71D5\u9EA6\u7C73"
          },
          {
            label: "\u7ED3\u6784",
            value: "\u5355\u4E3B\u888B\uFF08\u6F14\u793A\uFF09"
          },
          {
            label: "\u9762\u6599",
            value: "\u5E06\u5E03\u793A\u610F"
          }
        ],
        imageType: "bag",
        color: "#b69b7c",
        images: [
          {
            id: "front",
            label: "\u6B63\u9762\u793A\u610F\u56FE"
          },
          {
            id: "detail",
            label: "\u63D0\u624B\u7EC6\u8282\u793A\u610F"
          }
        ],
        source: "demo/products-demo.json",
        updated: "2026-10-28"
      },
      {
        id: "demo-shirt",
        sku: "OD-SH-606",
        name: "\u57FA\u7840\u77ED\u8896\u886C\u886B",
        category: "\u670D\u9970",
        price: "\xA5189",
        model: "SH-606",
        summary: "\u7B80\u6D01\u901A\u52E4\u7248\u578B\u6F14\u793A\uFF0C\u5C3A\u5BF8\u8868\u548C\u5177\u4F53\u5E93\u5B58\u9700\u4EBA\u5DE5\u786E\u8BA4\u3002",
        specs: [
          {
            label: "\u989C\u8272",
            value: "\u6D45\u84DD"
          },
          {
            label: "\u5C3A\u7801",
            value: "S / M / L\uFF08\u6F14\u793A\uFF09"
          },
          {
            label: "\u9886\u578B",
            value: "\u7FFB\u9886"
          }
        ],
        imageType: "shirt",
        color: "#8bacc9",
        images: [
          {
            id: "front",
            label: "\u6B63\u9762\u793A\u610F\u56FE"
          },
          {
            id: "detail",
            label: "\u9886\u53E3\u7EC6\u8282\u793A\u610F"
          }
        ],
        source: "demo/products-demo.json",
        updated: "2026-10-28"
      }
    ]
  };

  // fixtures/orders-demo.json
  var orders_demo_default = {
    schemaVersion: 1,
    format: "opendesk.ai-customer-support.orders-demo",
    demo: true,
    provider: "local-demo",
    description: "\u53EA\u8BFB\u5B8C\u5168\u865A\u6784\u7684\u8BA2\u5355\uFF0C\u91D1\u989D\u3001\u652F\u4ED8\u3001\u7269\u6D41\u3001\u552E\u540E\u4E0D\u4EE3\u8868\u771F\u5B9E\u72B6\u6001\u3002",
    orders: [
      {
        orderId: "OD-DEMO-1001",
        customerId: "t1",
        items: [
          {
            productId: "demo-jacket",
            sku: "OD-JK-101",
            quantity: 1,
            specification: "\u6D77\u519B\u84DD / M"
          }
        ],
        status: "\u8FD0\u8F93\u4E2D",
        amount: 299,
        paymentStatus: "\u5DF2\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u8FD0\u8F93\u4E2D\uFF08\u6F14\u793A\uFF09",
        afterSalesStatus: "\u6682\u65E0\u552E\u540E\u8BB0\u5F55",
        updatedAt: "2026-10-28",
        source: "demo/orders-demo.json"
      },
      {
        orderId: "OD-DEMO-1002",
        customerId: "t1",
        items: [
          {
            productId: "demo-bottle",
            sku: "OD-CU-303",
            quantity: 1,
            specification: "\u96FE\u84DD / 480mL"
          }
        ],
        status: "\u5DF2\u5B8C\u6210",
        amount: 129,
        paymentStatus: "\u5DF2\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u5DF2\u7B7E\u6536\uFF08\u6F14\u793A\uFF09",
        afterSalesStatus: "\u6682\u65E0\u552E\u540E\u8BB0\u5F55",
        updatedAt: "2026-10-26",
        source: "demo/orders-demo.json"
      },
      {
        orderId: "OD-DEMO-1003",
        customerId: "t1",
        items: [
          {
            productId: "demo-shoes",
            sku: "OD-SN-202",
            quantity: 1,
            specification: "\u5CA9\u7070 / 39"
          }
        ],
        status: "\u552E\u540E\u4E2D",
        amount: 359,
        paymentStatus: "\u5DF2\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u5DF2\u7B7E\u6536\uFF08\u6F14\u793A\uFF09",
        afterSalesStatus: "\u7533\u8BF7\u5F85\u4EBA\u5DE5\u6838\u5B9E",
        updatedAt: "2026-10-27",
        source: "demo/orders-demo.json"
      },
      {
        orderId: "OD-DEMO-2001",
        customerId: "t2",
        items: [
          {
            productId: "demo-speaker",
            sku: "OD-SP-404",
            quantity: 1,
            specification: "\u77F3\u58A8\u9ED1"
          }
        ],
        status: "\u5F85\u53D1\u8D27",
        amount: 239,
        paymentStatus: "\u5DF2\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u5F85\u51FA\u5E93\uFF08\u6F14\u793A\uFF09",
        afterSalesStatus: "\u6682\u65E0\u552E\u540E\u8BB0\u5F55",
        updatedAt: "2026-10-27",
        source: "demo/orders-demo.json"
      },
      {
        orderId: "OD-DEMO-2002",
        customerId: "t2",
        items: [
          {
            productId: "demo-bag",
            sku: "OD-BG-505",
            quantity: 2,
            specification: "\u71D5\u9EA6\u7C73"
          }
        ],
        status: "\u5F85\u4ED8\u6B3E",
        amount: 318,
        paymentStatus: "\u672A\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u6682\u65E0\u7269\u6D41",
        afterSalesStatus: "\u4E0D\u9002\u7528",
        updatedAt: "2026-10-28",
        source: "demo/orders-demo.json"
      },
      {
        orderId: "OD-DEMO-2003",
        customerId: "t2",
        items: [
          {
            productId: "demo-shoes",
            sku: "OD-SN-202",
            quantity: 1,
            specification: "\u5CA9\u7070 / 42"
          }
        ],
        status: "\u8FD0\u8F93\u4E2D",
        amount: 359,
        paymentStatus: "\u5DF2\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u8FD0\u8F93\u4E2D\uFF08\u6F14\u793A\uFF09",
        afterSalesStatus: "\u6682\u65E0\u552E\u540E\u8BB0\u5F55",
        updatedAt: "2026-10-25",
        source: "demo/orders-demo.json"
      },
      {
        orderId: "OD-DEMO-3001",
        customerId: "t3",
        items: [
          {
            productId: "demo-shirt",
            sku: "OD-SH-606",
            quantity: 1,
            specification: "\u6D45\u84DD / M"
          }
        ],
        status: "\u5DF2\u5B8C\u6210",
        amount: 189,
        paymentStatus: "\u5DF2\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u5DF2\u7B7E\u6536\uFF08\u6F14\u793A\uFF09",
        afterSalesStatus: "\u6682\u65E0\u552E\u540E\u8BB0\u5F55",
        updatedAt: "2026-10-24",
        source: "demo/orders-demo.json"
      },
      {
        orderId: "OD-DEMO-3002",
        customerId: "t3",
        items: [
          {
            productId: "demo-jacket",
            sku: "OD-JK-101",
            quantity: 1,
            specification: "\u6D77\u519B\u84DD / L"
          },
          {
            productId: "demo-bottle",
            sku: "OD-CU-303",
            quantity: 1,
            specification: "\u96FE\u84DD / 480mL"
          }
        ],
        status: "\u5F85\u53D1\u8D27",
        amount: 428,
        paymentStatus: "\u5DF2\u652F\u4ED8\uFF08\u6F14\u793A\uFF09",
        shippingStatus: "\u5F85\u51FA\u5E93\uFF08\u6F14\u793A\uFF09",
        afterSalesStatus: "\u6682\u65E0\u552E\u540E\u8BB0\u5F55",
        updatedAt: "2026-10-28",
        source: "demo/orders-demo.json"
      }
    ]
  };

  // src/domain/catalog.ts
  var products = Object.freeze(products_demo_default.products);
  var allOrders = Object.freeze(orders_demo_default.orders);
  var customers = Object.freeze(["t1", "t2", "t3"]);
  var isCustomerId = (value) => typeof value === "string" && customers.includes(value);
  function validOrder(order) {
    return isCustomerId(order.customerId) && typeof order.orderId === "string" && Number.isFinite(order.amount) && Array.isArray(order.items) && order.items.length > 0 && order.items.every((item) => Number.isInteger(item.quantity) && item.quantity > 0 && products.some((product) => product.id === item.productId && product.sku === item.sku));
  }
  var validatedOrders = allOrders.filter(validOrder);

  // src/domain/business.ts
  var BUSINESS_LIMITS = Object.freeze({
    maxRecordsPerStore: 1e3,
    maxStores: 20,
    maxImageBytes: 128 * 1024,
    maxSnapshotBytes: 1024 * 1024,
    maxBackupBytes: 8 * 1024 * 1024,
    maxStoreBytes: 6 * 1024 * 1024,
    maxImageDimension: 4096,
    maxImagePixels: 4 * 1024 * 1024
  });
  var {
    maxRecordsPerStore: MAX_RECORDS,
    maxStores: MAX_STORES,
    maxImageBytes: MAX_IMAGE_BYTES,
    maxSnapshotBytes: MAX_SNAPSHOT_BYTES,
    maxBackupBytes: MAX_BACKUP_BYTES,
    maxStoreBytes: MAX_STORE_BYTES
  } = BUSINESS_LIMITS;
  var BACKUP_FORMAT = "opendesk.ai-customer-support.business-backup";
  var kinds = ["product", "order", "image", "customer"];
  var forbidden = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  function fail(message) {
    throw new Error("Business data: " + message);
  }
  var bytes = (s) => {
    let size = 0;
    for (const character of s) {
      const code = character.codePointAt(0);
      size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    }
    return size;
  };
  function object(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("expected plain object");
    const o = value;
    if (keys && (Object.keys(o).length !== keys.length || keys.some((k) => !Object.hasOwn(o, k)))) fail("missing or unknown keys");
    if (keys && Object.keys(o).some((k) => !keys.includes(k))) fail("unknown key");
    return o;
  }
  function text(value, max = 2e3, empty = false) {
    if (typeof value !== "string" || value.length > max || !empty && !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail("invalid string");
  }
  function id(value) {
    text(value, 160);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:@/\-]*$/.test(value) || forbidden.has(value)) fail("invalid identifier");
  }
  function integer(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail("invalid integer");
  }
  function list(value, max, min = 0) {
    if (!Array.isArray(value) || value.length < min || value.length > max) fail("invalid array size");
  }
  function date(value, timestamp = false) {
    text(value, 30);
    if (timestamp) {
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z")) fail("invalid UTC timestamp");
    } else if (!/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail("invalid date");
  }
  function safeTree(value, maxBytes) {
    let nodes = 0;
    function walk(v, depth) {
      if (++nodes > 25e4 || depth > 20) fail("JSON complexity limit");
      if (v === null || typeof v === "boolean" || typeof v === "string") return;
      if (typeof v === "number") {
        if (!Number.isFinite(v)) fail("nonfinite number");
        return;
      }
      if (typeof v !== "object") fail("not JSON data");
      if (Array.isArray(v)) {
        if (v.length > MAX_STORES * MAX_RECORDS * 2) fail("array limit");
        if (Object.getPrototypeOf(v) !== Array.prototype || Reflect.ownKeys(v).length !== v.length + 1) fail("not JSON array");
        for (let i = 0; i < v.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("not JSON array item");
          walk(descriptor.value, depth + 1);
        }
      } else {
        const o = object(v);
        for (const key of Reflect.ownKeys(o)) {
          if (typeof key !== "string" || forbidden.has(key)) fail("prototype key");
          const descriptor = Object.getOwnPropertyDescriptor(o, key);
          if (!descriptor.enumerable || !("value" in descriptor)) fail("not JSON property");
          walk(descriptor.value, depth + 1);
        }
      }
    }
    walk(value, 0);
    if (bytes(JSON.stringify(value)) > maxBytes) fail("JSON byte limit");
  }
  function parse(textValue, max) {
    if (typeof textValue !== "string" || textValue.length > max || bytes(textValue) > max) fail("JSON byte limit");
    let value;
    try {
      value = JSON.parse(textValue);
    } catch {
      return fail("invalid JSON");
    }
    safeTree(value, max);
    return value;
  }
  function bitmapDimensions(raw, type) {
    const u = (n) => raw.charCodeAt(n);
    const be16 = (n) => u(n) * 256 + u(n + 1);
    const be32 = (n) => u(n) * 16777216 + u(n + 1) * 65536 + u(n + 2) * 256 + u(n + 3);
    const le16 = (n) => u(n) + u(n + 1) * 256;
    const le24 = (n) => le16(n) + u(n + 2) * 65536;
    const le32 = (n) => le24(n) + u(n + 3) * 16777216;
    if (type === "png") {
      if (!raw.startsWith("\x89PNG\r\n\n")) fail("bitmap magic bytes mismatch");
      let offset2 = 8, width = 0, height = 0, imageData = false, ended = false;
      while (offset2 + 12 <= raw.length) {
        const length = be32(offset2), tag = raw.slice(offset2 + 4, offset2 + 8), data = offset2 + 8;
        if (length > raw.length - offset2 - 12) fail("truncated PNG chunk");
        if (offset2 === 8 && (tag !== "IHDR" || length !== 13)) fail("missing PNG IHDR");
        if (tag === "IHDR") {
          if (offset2 !== 8 || length !== 13) fail("invalid PNG IHDR");
          width = be32(data);
          height = be32(data + 4);
          const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
          if (!depths[u(data + 9)]?.includes(u(data + 8)) || u(data + 10) !== 0 || u(data + 11) !== 0 || u(data + 12) > 1) fail("invalid PNG encoding");
        } else if (tag === "IDAT") imageData || (imageData = length > 0);
        else if (tag === "acTL") fail("animated PNG not supported");
        else if (tag === "IEND") {
          if (length !== 0 || !imageData || offset2 + 12 !== raw.length) fail("invalid PNG end");
          ended = true;
        }
        offset2 += length + 12;
      }
      if (!ended || offset2 !== raw.length) fail("truncated PNG");
      return [width, height];
    }
    if (type === "jpeg") {
      if (raw.length < 4 || u(0) !== 255 || u(1) !== 216) fail("bitmap magic bytes mismatch");
      let offset2 = 2, width = 0, height = 0, scan = false, entropy = false;
      while (offset2 < raw.length) {
        if (u(offset2++) !== 255) fail("invalid JPEG marker");
        while (offset2 < raw.length && u(offset2) === 255) offset2++;
        const marker = u(offset2++);
        if (marker === 217) {
          if (!scan || !entropy || offset2 !== raw.length) fail("truncated JPEG image");
          return [width, height];
        }
        if (marker === 216 || marker === 0 || marker >= 208 && marker <= 215 || offset2 + 2 > raw.length) fail("invalid JPEG segment");
        const length = be16(offset2), data = offset2 + 2;
        if (length < 2 || length > raw.length - offset2) fail("truncated JPEG segment");
        if ([192, 193, 194].includes(marker)) {
          if (width || length < 11 || u(data) !== 8 || u(data + 5) < 1 || u(data + 5) > 4 || length !== 8 + 3 * u(data + 5)) fail("invalid JPEG SOF");
          height = be16(data + 1);
          width = be16(data + 3);
        } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) fail("unsupported JPEG SOF");
        offset2 += length;
        if (marker === 218) {
          if (!width || !height || length < 8 || u(data) < 1 || u(data) > 4 || length !== 6 + 2 * u(data)) fail("invalid JPEG SOS");
          scan = true;
          while (offset2 < raw.length) {
            if (u(offset2) !== 255) {
              entropy = true;
              offset2++;
              continue;
            }
            if (offset2 + 1 >= raw.length) fail("truncated JPEG scan");
            const next = u(offset2 + 1);
            if (next === 0 || next >= 208 && next <= 215) {
              entropy = true;
              offset2 += 2;
              continue;
            }
            break;
          }
        }
      }
      return fail("missing JPEG EOI");
    }
    if (!raw.startsWith("RIFF") || raw.slice(8, 12) !== "WEBP" || raw.length < 20 || le32(4) !== raw.length - 8) fail("bitmap magic bytes mismatch");
    let offset = 12, canvas, image;
    while (offset + 8 <= raw.length) {
      const tag = raw.slice(offset, offset + 4), length = le32(offset + 4), data = offset + 8;
      if (length > raw.length - data || data + length + length % 2 > raw.length) fail("truncated WebP chunk");
      if (tag === "VP8X") {
        if (offset !== 12 || canvas || length !== 10 || u(data) & 195 || le24(data + 1) !== 0) fail("invalid or animated WebP");
        canvas = [le24(data + 4) + 1, le24(data + 7) + 1];
      } else if (tag === "VP8 ") {
        if (image || length <= 10 || u(data) & 1 || raw.slice(data + 3, data + 6) !== "\x9D*") fail("invalid WebP VP8");
        image = [le16(data + 6) & 16383, le16(data + 8) & 16383];
      } else if (tag === "VP8L") {
        if (image || length <= 5 || u(data) !== 47 || u(data + 4) >> 5 !== 0) fail("invalid WebP VP8L");
        const bits = le32(data + 1);
        image = [(bits & 16383) + 1, (bits >>> 14 & 16383) + 1];
      } else if (tag === "ANIM" || tag === "ANMF") fail("animated WebP not supported");
      offset = data + length + length % 2;
    }
    if (!image || offset !== raw.length || canvas && (canvas[0] !== image[0] || canvas[1] !== image[1])) fail("invalid WebP dimensions/chunks");
    return image;
  }
  function bitmap(value) {
    if (value === null) return;
    text(value, Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64);
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) fail("only base64 PNG/JPEG/WebP bitmaps allowed");
    let raw;
    try {
      raw = atob(match[2]);
    } catch {
      return fail("invalid base64");
    }
    if (raw.length > MAX_IMAGE_BYTES || btoa(raw) !== match[2]) fail("bitmap size or encoding");
    const [width, height] = bitmapDimensions(raw, match[1]);
    if (!width || !height || width > BUSINESS_LIMITS.maxImageDimension || height > BUSINESS_LIMITS.maxImageDimension || width * height > BUSINESS_LIMITS.maxImagePixels) fail("bitmap dimensions/pixel limit");
  }
  function validateEntity(value) {
    const e = object(value, ["storeId", "sourceId", "kind", "id", "version", "updatedAt", "deleted", "data"]);
    id(e.storeId);
    id(e.sourceId);
    id(e.id);
    integer(e.version);
    date(e.updatedAt, true);
    if (!kinds.includes(e.kind) || typeof e.deleted !== "boolean") fail("invalid kind/deleted");
    if (e.deleted) {
      if (e.data !== null) fail("tombstone must have null data");
      return;
    }
    if (e.kind === "product") {
      const p = object(e.data, ["id", "sku", "name", "category", "price", "model", "summary", "specs", "imageType", "color", "images", "source", "updated"]);
      if (p.id !== e.id) fail("product id mismatch");
      id(p.id);
      id(p.sku);
      for (const k of ["name", "category", "model", "summary", "source"]) text(p[k]);
      text(p.price, 32);
      if (!/^¥(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(p.price)) fail("invalid product price");
      date(p.updated);
      if (!["jacket", "shoe", "bottle", "speaker", "bag", "shirt"].includes(p.imageType)) fail("invalid imageType");
      if (typeof p.color !== "string" || !/^#[0-9a-f]{6}$/i.test(p.color)) fail("invalid color");
      list(p.specs, 30);
      list(p.images, 30);
      for (const item of p.specs) {
        const v = object(item, ["label", "value"]);
        text(v.label, 200);
        text(v.value);
      }
      const ids = /* @__PURE__ */ new Set();
      for (const item of p.images) {
        const v = object(item, ["id", "label"]);
        id(v.id);
        text(v.label, 200);
        if (ids.has(v.id)) fail("duplicate product image id");
        ids.add(v.id);
      }
    } else if (e.kind === "order") {
      const o = object(e.data, ["orderId", "customerId", "items", "status", "amount", "paymentStatus", "shippingStatus", "afterSalesStatus", "updatedAt", "source"]);
      if (o.orderId !== e.id) fail("order id mismatch");
      id(o.orderId);
      id(o.customerId);
      date(o.updatedAt);
      if (!["\u5F85\u4ED8\u6B3E", "\u5F85\u53D1\u8D27", "\u8FD0\u8F93\u4E2D", "\u5DF2\u5B8C\u6210", "\u552E\u540E\u4E2D", "\u5DF2\u53D6\u6D88", "\u5DF2\u5173\u95ED"].includes(o.status)) fail("invalid order status");
      if (typeof o.amount !== "number" || !Number.isFinite(o.amount) || o.amount < 0 || o.amount > 1e9 || !Number.isSafeInteger(Math.round(o.amount * 100)) || Math.round(o.amount * 100) / 100 !== o.amount) fail("invalid amount");
      for (const k of ["paymentStatus", "shippingStatus", "afterSalesStatus", "source"]) text(o[k]);
      list(o.items, 100, 1);
      for (const item of o.items) {
        const v = object(item, ["productId", "sku", "quantity", "specification"]);
        id(v.productId);
        id(v.sku);
        integer(v.quantity, 1, 1e5);
        text(v.specification);
      }
    } else if (e.kind === "customer") {
      const c = object(e.data, ["name", "conversationId", "tags", "notes"]);
      text(c.name, 200);
      text(c.notes, 1e4, true);
      list(c.tags, 30);
      for (const tag of c.tags) text(tag, 100);
      if (new Set(c.tags).size !== c.tags.length) fail("duplicate tags");
      if (c.conversationId !== null && !isCustomerId(c.conversationId)) fail("invalid conversation mapping");
    } else {
      const image = object(e.data, ["productId", "imageId", "label", "dataUrl"]);
      id(image.productId);
      id(image.imageId);
      text(image.label, 200);
      bitmap(image.dataUrl);
    }
  }
  var entityKey = (e) => JSON.stringify([e.storeId, e.kind, e.id]);
  function effective(state) {
    const map = new Map(state.records.map((e) => [entityKey(e), e]));
    for (const e of state.overrides) map.set(entityKey(e), e);
    return [...map.values()].filter((e) => !e.deleted);
  }
  function references(records) {
    const map = new Map(records.filter((e) => !e.deleted).map((e) => [entityKey(e), e]));
    const slots = /* @__PURE__ */ new Set(), images = /* @__PURE__ */ new Set();
    for (const e of map.values()) {
      const ref = (kind, target) => {
        const found = map.get(entityKey({ storeId: e.storeId, kind, id: target }));
        if (!found || found.sourceId !== e.sourceId) fail("dangling or cross-source reference");
        return found;
      };
      if (e.kind === "order" && e.data) {
        ref("customer", e.data.customerId);
        for (const item of e.data.items) {
          const p = ref("product", item.productId);
          if (p.kind !== "product" || p.data?.sku !== item.sku) fail("order SKU mismatch");
        }
      } else if (e.kind === "image" && e.data) {
        const p = ref("product", e.data.productId);
        if (p.kind !== "product" || !p.data?.images.some((i) => i.id === e.data.imageId)) fail("unknown product image");
        const key = JSON.stringify([e.storeId, e.data.productId, e.data.imageId]);
        if (images.has(key)) fail("duplicate image slot");
        images.add(key);
      } else if (e.kind === "customer" && e.data?.conversationId) {
        const key = JSON.stringify([e.storeId, e.data.conversationId]);
        if (slots.has(key)) fail("duplicate conversation mapping");
        slots.add(key);
      }
    }
  }
  function validateState(value) {
    safeTree(value, MAX_BACKUP_BYTES);
    const s = object(value, ["revision", "stores", "records", "overrides", "cursors"]);
    integer(s.revision, 0);
    list(s.stores, MAX_STORES, 1);
    list(s.records, MAX_STORES * MAX_RECORDS);
    list(s.overrides, MAX_STORES * MAX_RECORDS);
    const stores = /* @__PURE__ */ new Set();
    for (const store of s.stores) {
      const v = object(store, ["id", "name"]);
      id(v.id);
      text(v.name, 200);
      if (stores.has(v.id)) fail("duplicate store");
      stores.add(v.id);
    }
    const records = /* @__PURE__ */ new Map(), overrides = /* @__PURE__ */ new Set();
    for (const value2 of s.records) {
      validateEntity(value2);
      if (!stores.has(value2.storeId)) fail("unknown store");
      const key = entityKey(value2);
      if (records.has(key)) fail("duplicate entity / ownership collision");
      records.set(key, value2);
    }
    for (const value2 of s.overrides) {
      validateEntity(value2);
      const key = entityKey(value2), base = records.get(key);
      if (!base || base.deleted || value2.sourceId === "local" || value2.kind === "order" || value2.sourceId !== base.sourceId || value2.version !== base.version || Date.parse(value2.updatedAt) < Date.parse(base.updatedAt)) fail("invalid local override owner/version");
      if (overrides.has(key)) fail("duplicate override");
      overrides.add(key);
    }
    const cursors = object(s.cursors);
    if (Object.keys(cursors).length > MAX_STORES * MAX_RECORDS) fail("cursor limit");
    for (const [key, cursor] of Object.entries(cursors)) {
      let pair;
      try {
        pair = JSON.parse(key);
      } catch {
        return fail("invalid cursor key");
      }
      list(pair, 2, 2);
      id(pair[0]);
      id(pair[1]);
      if (!stores.has(pair[0]) || pair[1] === "local" || JSON.stringify(pair) !== key) fail("invalid cursor owner");
      text(cursor, 512);
    }
    const state = value;
    for (const storeId of stores) {
      const r = state.records.filter((e) => e.storeId === storeId), o = state.overrides.filter((e) => e.storeId === storeId);
      if (r.length > MAX_RECORDS || o.length > MAX_RECORDS || bytes(JSON.stringify([r, o])) > MAX_STORE_BYTES) fail("whole store limit");
    }
    references(state.records);
    references(effective(state));
  }
  function parseBusinessBackup(value) {
    const b = object(parse(value, MAX_BACKUP_BYTES), ["schemaVersion", "format", "revision", "stores", "records", "overrides", "cursors"]);
    if (b.schemaVersion !== 1 || b.format !== BACKUP_FORMAT) fail("unsupported backup format");
    const state = { revision: b.revision, stores: b.stores, records: b.records, overrides: b.overrides, cursors: b.cursors };
    validateState(state);
    return state;
  }
  return __toCommonJS(business_validator_entry_exports);
})();
globalThis.OpenDeskSupportBusinessDomain=OpenDeskSupportBusinessDomain;
