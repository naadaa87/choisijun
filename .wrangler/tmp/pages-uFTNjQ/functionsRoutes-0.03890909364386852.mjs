import { onRequestPost as __api_community_comment_js_onRequestPost } from "/home/claude/choisijun/functions/api/community/comment.js"
import { onRequest as __api_admin___path___js_onRequest } from "/home/claude/choisijun/functions/api/admin/[[path]].js"
import { onRequestGet as __api_community_index_js_onRequestGet } from "/home/claude/choisijun/functions/api/community/index.js"
import { onRequestPost as __api_community_index_js_onRequestPost } from "/home/claude/choisijun/functions/api/community/index.js"
import { onRequestGet as __api_health_js_onRequestGet } from "/home/claude/choisijun/functions/api/health.js"
import { onRequestPost as __api_inquiry_js_onRequestPost } from "/home/claude/choisijun/functions/api/inquiry.js"
import { onRequestGet as __api_references_js_onRequestGet } from "/home/claude/choisijun/functions/api/references.js"
import { onRequest as __content___path___js_onRequest } from "/home/claude/choisijun/functions/content/[[path]].js"
import { onRequest as __data___path___js_onRequest } from "/home/claude/choisijun/functions/data/[[path]].js"
import { onRequest as __fragments___path___js_onRequest } from "/home/claude/choisijun/functions/fragments/[[path]].js"
import { onRequest as __functions___path___js_onRequest } from "/home/claude/choisijun/functions/functions/[[path]].js"
import { onRequest as __setup___path___js_onRequest } from "/home/claude/choisijun/functions/setup/[[path]].js"
import { onRequest as __tools___path___js_onRequest } from "/home/claude/choisijun/functions/tools/[[path]].js"

export const routes = [
    {
      routePath: "/api/community/comment",
      mountPath: "/api/community",
      method: "POST",
      middlewares: [],
      modules: [__api_community_comment_js_onRequestPost],
    },
  {
      routePath: "/api/admin/:path*",
      mountPath: "/api/admin",
      method: "",
      middlewares: [],
      modules: [__api_admin___path___js_onRequest],
    },
  {
      routePath: "/api/community",
      mountPath: "/api/community",
      method: "GET",
      middlewares: [],
      modules: [__api_community_index_js_onRequestGet],
    },
  {
      routePath: "/api/community",
      mountPath: "/api/community",
      method: "POST",
      middlewares: [],
      modules: [__api_community_index_js_onRequestPost],
    },
  {
      routePath: "/api/health",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_health_js_onRequestGet],
    },
  {
      routePath: "/api/inquiry",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_inquiry_js_onRequestPost],
    },
  {
      routePath: "/api/references",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_references_js_onRequestGet],
    },
  {
      routePath: "/content/:path*",
      mountPath: "/content",
      method: "",
      middlewares: [],
      modules: [__content___path___js_onRequest],
    },
  {
      routePath: "/data/:path*",
      mountPath: "/data",
      method: "",
      middlewares: [],
      modules: [__data___path___js_onRequest],
    },
  {
      routePath: "/fragments/:path*",
      mountPath: "/fragments",
      method: "",
      middlewares: [],
      modules: [__fragments___path___js_onRequest],
    },
  {
      routePath: "/functions/:path*",
      mountPath: "/functions",
      method: "",
      middlewares: [],
      modules: [__functions___path___js_onRequest],
    },
  {
      routePath: "/setup/:path*",
      mountPath: "/setup",
      method: "",
      middlewares: [],
      modules: [__setup___path___js_onRequest],
    },
  {
      routePath: "/tools/:path*",
      mountPath: "/tools",
      method: "",
      middlewares: [],
      modules: [__tools___path___js_onRequest],
    },
  ]