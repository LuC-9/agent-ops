import type { ThemeConfig } from "antd";

// L'Oréal-inspired palette: black + gold on a light surface.
export const BRAND = {
  gold: "#B6862C",      // primary gold
  goldSoft: "#C9A85C",
  black: "#0A0A0A",
  ink: "#1A1A1A",
  surface: "#F5F3EF",   // warm light background
  paper: "#FFFFFF",
  border: "#E6E0D6",
};

export const lorealTheme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.gold,
    colorLink: BRAND.gold,
    colorInfo: BRAND.gold,
    colorTextHeading: BRAND.ink,
    colorBgLayout: BRAND.surface,
    borderRadius: 9,
    fontFamily:
      "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', Roboto, sans-serif",
    fontSize: 13,
    controlHeight: 32,
  },
  components: {
    Layout: {
      headerBg: BRAND.black,
      headerColor: "#FFFFFF",
      headerHeight: 58,
      bodyBg: BRAND.surface,
      siderBg: BRAND.black,
    },
    Menu: {
      darkItemBg: "transparent",
      darkItemColor: "#cfc9bd",
      darkItemHoverColor: "#ffffff",
      darkItemSelectedBg: BRAND.gold,
      darkItemSelectedColor: "#0A0A0A",
    },
    Table: {
      headerBg: BRAND.ink,
      headerColor: "#FFFFFF",
      headerSortActiveBg: "#2a2a2a",
      rowHoverBg: "#FBF7EF",
    },
    Tabs: { inkBarColor: BRAND.gold, itemSelectedColor: BRAND.gold },
    Statistic: { contentFontSize: 20, titleFontSize: 11 },
    Card: { headerFontSize: 14 },
    Button: { primaryShadow: "none" },
  },
};

export const ERROR_RED = "#C0392B";

// shared color ramp for charts (gold-forward, black anchor)
export const CHART_COLORS = [
  BRAND.gold, BRAND.ink, BRAND.goldSoft, "#7A6A45", "#3D3D3D", "#D8C9A3",
];
