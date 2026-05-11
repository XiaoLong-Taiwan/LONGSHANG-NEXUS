import { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";

type Locale = "en" | "zh-CN" | "zh-TW";

type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = {
  "en": {
    "language.label": "Language",
    "nav.overview": "Overview",
    "nav.connections": "Connections",
    "nav.users": "Users",
    "nav.apiKeys": "API Keys",
    "nav.providerKeys": "Upstreams",
    "nav.proxies": "Proxy Nodes",
    "nav.models": "Models",
    "nav.usage": "Usage Logs",
    "layout.connectedBackend": "Connected backend",
    "layout.signOut": "Sign out",
    "login.badge": "OpenAI-compatible AI Gateway",
    "login.title": "Gateway Console",
    "login.subtitle": "Choose a backend connection, verify reachability, then sign in with the admin or user account for that specific gateway node.",
    "login.email": "Email",
    "login.password": "Password",
    "login.testBackend": "Test backend",
    "login.signIn": "Sign in",
    "login.signingIn": "Signing in...",
    "login.checking": "Checking...",
    "login.addBackend": "Add another backend",
    "login.hideBackend": "Hide backend form",
    "login.saveBackend": "Save backend",
    "login.backendName": "Backend name",
    "login.backendBaseUrl": "Backend base URL",
    "login.allowSelfSigned": "Allow self-signed HTTPS",
    "login.defaultAdmin": "Default development account",
    "login.connectionStatus": "Connection status",
    "login.noAdmin": "This account does not have admin console access.",
    "provider.title": "Upstream Integrations",
    "provider.description": "Manage upstream API integrations with grouped keys, OAuth-based credentials, proxy assignment, and model detection.",
    "provider.add": "Add upstream",
    "provider.detectAll": "Auto detect all upstreams",
    "provider.modalTitle": "Configure upstream integration",
    "provider.name": "Name",
    "provider.descriptionField": "Description",
    "provider.provider": "Provider",
    "provider.baseUrl": "API base",
    "provider.authMode": "Authorization mode",
    "provider.oauthAccount": "OAuth account",
    "provider.keys": "API keys",
    "provider.keysHelp": "One key per line. The gateway will distribute requests inside the same upstream.",
    "provider.accessMode": "Access strategy",
    "provider.proxy": "Proxy node",
    "provider.modelDetect": "Auto detect models",
    "provider.save": "Save upstream",
    "provider.cancel": "Cancel",
    "provider.tableName": "Name",
    "provider.tableProvider": "Provider",
    "provider.tableStrategy": "Strategy",
    "provider.tableKeys": "Keys",
    "provider.tableProxy": "Proxy",
    "provider.tableStatus": "Status",
    "provider.tableActions": "Actions",
    "provider.actionDetect": "Detect models",
    "provider.actionDelete": "Delete",
    "models.title": "Model Registry",
    "models.description": "Detected and synchronized upstream model catalog used for routing and OpenAI-compatible exposure.",
    "models.detectAll": "Detect upstream models",
    "models.syncAll": "Sync provider catalogs",
    "connections.title": "Connections",
    "connections.description": "Manage multiple backend gateways. Each browser session can switch between backend nodes without redeploying the frontend.",
  },
  "zh-CN": {
    "language.label": "语言",
    "nav.overview": "总览",
    "nav.connections": "连接",
    "nav.users": "用户",
    "nav.apiKeys": "API Key",
    "nav.providerKeys": "上游集成",
    "nav.proxies": "代理节点",
    "nav.models": "模型",
    "nav.usage": "使用日志",
    "layout.connectedBackend": "当前后端",
    "layout.signOut": "退出登录",
    "login.badge": "兼容 OpenAI 的 AI 网关",
    "login.title": "网关控制台",
    "login.subtitle": "选择后端连接，先测试可达性，再用该网关节点上的管理员或用户账号登录。",
    "login.email": "邮箱",
    "login.password": "密码",
    "login.testBackend": "测试后端",
    "login.signIn": "登录",
    "login.signingIn": "登录中...",
    "login.checking": "检测中...",
    "login.addBackend": "新增后端",
    "login.hideBackend": "收起后端表单",
    "login.saveBackend": "保存后端",
    "login.backendName": "后端名称",
    "login.backendBaseUrl": "后端地址",
    "login.allowSelfSigned": "允许自签 HTTPS",
    "login.defaultAdmin": "默认开发管理员账号",
    "login.connectionStatus": "连接状态",
    "login.noAdmin": "该账号可以登录，但没有管理控制台权限。",
    "provider.title": "上游集成",
    "provider.description": "管理上游 API 集成，支持多 Key、OAuth 凭证、代理分配与模型自动探测。",
    "provider.add": "新增上游",
    "provider.detectAll": "自动探测全部上游",
    "provider.modalTitle": "配置上游集成",
    "provider.name": "名称",
    "provider.descriptionField": "描述",
    "provider.provider": "提供商",
    "provider.baseUrl": "API 地址",
    "provider.authMode": "鉴权方式",
    "provider.oauthAccount": "OAuth 账号",
    "provider.keys": "API Key 列表",
    "provider.keysHelp": "每行一个 key，同一个上游内会按策略自动分发。",
    "provider.accessMode": "访问策略",
    "provider.proxy": "代理节点",
    "provider.modelDetect": "自动探测模型",
    "provider.save": "保存上游",
    "provider.cancel": "取消",
    "provider.tableName": "名称",
    "provider.tableProvider": "提供商",
    "provider.tableStrategy": "策略",
    "provider.tableKeys": "Key 数量",
    "provider.tableProxy": "代理",
    "provider.tableStatus": "状态",
    "provider.tableActions": "操作",
    "provider.actionDetect": "探测模型",
    "provider.actionDelete": "删除",
    "models.title": "模型注册表",
    "models.description": "已探测与同步的上游模型目录，用于路由和 OpenAI 兼容暴露。",
    "models.detectAll": "探测上游模型",
    "models.syncAll": "同步提供商目录",
    "connections.title": "连接",
    "connections.description": "管理多个后端网关，同一个浏览器会话中可以随时切换。",
  },
  "zh-TW": {
    "language.label": "語言",
    "nav.overview": "總覽",
    "nav.connections": "連線",
    "nav.users": "使用者",
    "nav.apiKeys": "API Key",
    "nav.providerKeys": "上游整合",
    "nav.proxies": "代理節點",
    "nav.models": "模型",
    "nav.usage": "使用紀錄",
    "layout.connectedBackend": "目前後端",
    "layout.signOut": "登出",
    "login.badge": "相容 OpenAI 的 AI Gateway",
    "login.title": "Gateway 控制台",
    "login.subtitle": "先選擇後端連線並測試可達性，再使用該節點上的管理員或使用者帳號登入。",
    "login.email": "Email",
    "login.password": "密碼",
    "login.testBackend": "測試後端",
    "login.signIn": "登入",
    "login.signingIn": "登入中...",
    "login.checking": "檢查中...",
    "login.addBackend": "新增後端",
    "login.hideBackend": "收起後端表單",
    "login.saveBackend": "儲存後端",
    "login.backendName": "後端名稱",
    "login.backendBaseUrl": "後端位址",
    "login.allowSelfSigned": "允許自簽 HTTPS",
    "login.defaultAdmin": "預設開發管理員帳號",
    "login.connectionStatus": "連線狀態",
    "login.noAdmin": "此帳號可以登入，但沒有管理控制台權限。",
    "provider.title": "上游整合",
    "provider.description": "管理上游 API 整合，支援多 Key、OAuth 憑證、代理分配與模型自動偵測。",
    "provider.add": "新增上游",
    "provider.detectAll": "自動偵測全部上游",
    "provider.modalTitle": "設定上游整合",
    "provider.name": "名稱",
    "provider.descriptionField": "描述",
    "provider.provider": "供應商",
    "provider.baseUrl": "API 位址",
    "provider.authMode": "授權方式",
    "provider.oauthAccount": "OAuth 帳號",
    "provider.keys": "API Key 清單",
    "provider.keysHelp": "每行一個 key，同一個上游內會依策略自動分配。",
    "provider.accessMode": "訪問策略",
    "provider.proxy": "代理節點",
    "provider.modelDetect": "自動偵測模型",
    "provider.save": "儲存上游",
    "provider.cancel": "取消",
    "provider.tableName": "名稱",
    "provider.tableProvider": "供應商",
    "provider.tableStrategy": "策略",
    "provider.tableKeys": "Key 數量",
    "provider.tableProxy": "代理",
    "provider.tableStatus": "狀態",
    "provider.tableActions": "操作",
    "provider.actionDetect": "偵測模型",
    "provider.actionDelete": "刪除",
    "models.title": "模型註冊表",
    "models.description": "已偵測與同步的上游模型清單，用於路由與 OpenAI 相容暴露。",
    "models.detectAll": "偵測上游模型",
    "models.syncAll": "同步供應商目錄",
    "connections.title": "連線",
    "connections.description": "管理多個後端 Gateway，同一個瀏覽器工作階段中可以隨時切換。",
  },
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "ai_gateway_locale";

export function LanguageProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "en";
    }
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    return stored || "en";
  });

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale: Locale) => {
      setLocaleState(nextLocale);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
      }
    },
    t: (key: string) => dictionaries[locale][key] || dictionaries.en[key] || key,
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside LanguageProvider");
  }
  return context;
}

export type { Locale };
