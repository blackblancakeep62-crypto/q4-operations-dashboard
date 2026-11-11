export const SCOPES = ["公司", "一组", "二组", "三组", "四组"] as const;
export type Scope = (typeof SCOPES)[number];
export const TIERS = ["生存目标", "准目标", "进阶目标"] as const;
export type Tier = (typeof TIERS)[number];
export const thresholds = {
  moneyAbsolute: 100,
  moneyRelative: 0.001,
  historicalProgress: 0.002,
  ahead: 0.01,
  staleDays: 3,
  cacheSeconds: 900,
  historyHours: 24,
};
export const sheetNames = {
  target: "01_经营目标",
  country: "2025年数据-国家每日",
  parent: "2025年数据-父单每日",
  october: "2026.10完成情况",
  erp: "2026.11 ERP数据源",
  products: "产品信息表",
};
