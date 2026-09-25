// Trạng thái dùng chung (cache) giữa các màn hình.
import { get, post, put, del, api } from './api.js';
import { setCurrency } from './util.js';

export const state = {
  settings: {},
  categories: [],
  priceLists: [],
  promotions: [],
  info: null,
  suppliers: [],
  loaded: false,
};

export async function loadSettings() {
  state.settings = await get('/api/settings');
  setCurrency(state.settings.currency || '₫');
  return state.settings;
}
export async function loadCategories() {
  state.categories = await get('/api/categories');
  return state.categories;
}
export async function loadPriceLists() {
  state.priceLists = await get('/api/price-lists');
  return state.priceLists;
}
export async function loadPromotions() {
  state.promotions = await get('/api/promotions');
  return state.promotions;
}
export async function loadInfo() {
  state.info = await get('/api/info');
  return state.info;
}
export async function loadSuppliers() {
  state.suppliers = await get('/api/suppliers');
  return state.suppliers;
}

export async function bootstrap() {
  await Promise.all([loadSettings(), loadCategories(), loadPriceLists(), loadPromotions(), loadInfo()]);
  state.loaded = true;
}

export const defaultPriceListId = () => {
  const id = Number(state.settings.default_price_list_id);
  if (id && state.priceLists.some((p) => p.id === id)) return id;
  const def = state.priceLists.find((p) => p.is_default);
  return def ? def.id : state.priceLists[0]?.id || null;
};

export const categoryName = (id) => state.categories.find((c) => c.id === id)?.name || '';

export { api };
