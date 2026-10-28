import productsDoc from '../../fixtures/products-demo.json';
import ordersDoc from '../../fixtures/orders-demo.json';

export type Product = (typeof productsDoc.products)[number];
export type Order = (typeof ordersDoc.orders)[number];
export const products: readonly Product[] = Object.freeze(productsDoc.products);
export const allOrders: readonly Order[] = Object.freeze(ordersDoc.orders);
export const customers = Object.freeze(['t1', 't2', 't3'] as const);
export type CustomerId = (typeof customers)[number];
export const isCustomerId = (value: unknown): value is CustomerId =>
  typeof value === 'string' && (customers as readonly string[]).includes(value);
export const normalize = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s|[，。！？?!.,]/g, '');

export const findProduct = (id: string | undefined) => products.find(p => p.id === id);
export const visibleProducts = (query: string, category: string) =>
  products.filter(p => (category === 'all' || p.category === category) &&
    normalize([p.name, p.sku, p.model, p.category, p.summary, ...p.specs.map(x => x.value)].join(' ')).includes(normalize(query)));

function validOrder(order: Order): boolean {
  return isCustomerId(order.customerId) && typeof order.orderId === 'string' &&
    Number.isFinite(order.amount) && Array.isArray(order.items) && order.items.length > 0 &&
    order.items.every(item => Number.isInteger(item.quantity) && item.quantity > 0 &&
      products.some(product => product.id === item.productId && product.sku === item.sku));
}
const validatedOrders = allOrders.filter(validOrder);
export const ordersForCustomer = (customerId: unknown, authorized: boolean): Order[] =>
  authorized && isCustomerId(customerId) ? validatedOrders.filter(o => o.customerId === customerId) : [];
export const orderForCustomer = (customerId: unknown, orderId: string, authorized: boolean): Order | null =>
  ordersForCustomer(customerId, authorized).find(o => o.orderId === orderId) ?? null;
export const orderMatches = (o: Order, query: string, status: string) =>
  (status === 'all' || o.status === status) &&
  normalize([o.orderId, o.status, ...o.items.flatMap(item => [item.sku, findProduct(item.productId)?.name || ''])].join(' ')).includes(normalize(query));
export const money = (value: number) => '¥' + Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
export function productCopyText(p: Product): string {
  return p.name + '（SKU：' + p.sku + '）\n型号：' + p.model + '\n' +
    p.specs.map(x => x.label + '：' + x.value).join('\n') +
    '\n演示参考价：' + p.price + '（非实时价格）\n来源：' + p.source +
    ' · ' + p.updated + '\n库存及配送请人工核实。';
}
export function orderSummary(o: Order): string {
  return '演示订单：' + o.orderId +
    '\n商品：' + o.items.map(i => (findProduct(i.productId)?.name || '商品资料缺失') +
      '（' + i.sku + '）×' + i.quantity + ' · ' + i.specification).join('；') +
    '\n演示金额：' + money(o.amount) + '\n状态：' + o.status +
    '\n付款：' + o.paymentStatus + '\n物流：' + o.shippingStatus +
    '\n售后：' + o.afterSalesStatus + '\n来源：' + o.source + ' · ' +
    o.updatedAt + '\n非实时数据，请人工核实。';
}
const shapes: Record<string, string> = {
  jacket:'<path d="M115 38 97 54 60 72 38 146 76 160 90 113 90 194 230 194 230 113 244 160 282 146 260 72 223 54 205 38 180 53 140 53Z"/><path d="M140 53 160 101 180 53" fill="none" stroke="#fff" stroke-width="4"/><path d="M160 101v93M90 113h140" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>',
  shoe:'<path d="M41 147c25 0 55-18 76-56l28 11c11 18 43 32 75 35 29 3 58 18 62 43 1 10-6 17-18 17H43c-25 0-28-37-2-50Z"/><path d="M38 175h240M121 114l25 17m-11-25 25 18m-7-23 23 17" fill="none" stroke="#fff" stroke-width="5"/>',
  bottle:'<rect x="120" y="40" width="80" height="33" rx="9"/><rect x="111" y="68" width="98" height="144" rx="25"/><path d="M117 107h86M125 173h70" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5"/>',
  speaker:'<rect x="70" y="67" width="180" height="128" rx="25"/><circle cx="132" cy="131" r="38" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="9"/><circle cx="209" cy="131" r="19" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="7"/>',
  bag:'<path d="M76 92h168l-12 125H88Z"/><path d="M120 95V63a40 40 0 0 1 80 0v32" fill="none" stroke="#fff" stroke-opacity=".88" stroke-width="12"/>',
  shirt:'<path d="M112 44 77 58 35 101 76 133 91 109 91 210h138V109l15 24 41-32-42-43-35-14-21 28h-54Z"/><path d="M133 43 160 89 187 43M160 89v121" fill="none" stroke="#fff" stroke-width="5"/>'
};
export function productArt(p: Product, index = 0): string {
  const color = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#5579a0';
  const sku = String(p.sku).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 22);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 320 240">' +
    '<rect width="320" height="240" rx="18" fill="' + (index ? '#e7ecf0' : '#eef2f8') + '"/>' +
    '<circle cx="266" cy="43" r="69" fill="#fff" fill-opacity=".53"/>' +
    '<circle cx="60" cy="216" r="88" fill="#dae4f2" fill-opacity=".75"/>' +
    '<ellipse cx="160" cy="217" rx="105" ry="12" fill="#7a91a9" fill-opacity=".14"/>' +
    '<g ' + (index ? 'transform="translate(160 120) rotate(-8) scale(.91) translate(-160 -120)"' : '') +
    ' fill="' + color + '" stroke="#30445f" stroke-opacity=".2" stroke-width="2" stroke-linejoin="round">' +
    (shapes[p.imageType] || shapes.bag) + '</g>' +
    '<text x="16" y="22" fill="#708198" font-family="system-ui,sans-serif" font-size="10" letter-spacing="1">DEMO · ' +
    sku + '</text><text x="304" y="223" text-anchor="end" fill="#73859b" font-family="system-ui,sans-serif" font-size="9">SVG ILLUSTRATION</text></svg>';
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
