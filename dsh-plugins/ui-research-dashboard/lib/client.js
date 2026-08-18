// Phase 4 ui-research-dashboard — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node TRIGGERED BY A USER MESSAGE keyword
// ("dashboard" / "仪表盘" / "统计" / "stats"). The renderer self-fetches the
// research bundles and shows a statistics panel (projects, paper counts, plan,
// recent projects). This validates the user-message-trigger pattern for
// non-MCP-tool pages (writing / settings / assistant come next).
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-dashboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var TRIGGERS = ["dashboard", "仪表盘", "统计", "stats"];

		function isTrigger(text) {
			if (typeof text !== "string") return false;
			var t = text.toLowerCase();
			for (var i = 0; i < TRIGGERS.length; i++) {
				if (t.indexOf(TRIGGERS[i]) !== -1) return true;
			}
			return false;
		}

		function userText(event) {
			var content = event.data && event.data.content;
			if (!Array.isArray(content)) return "";
			var out = "";
			for (var i = 0; i < content.length; i++) {
				if (content[i] && content[i].type === "text") out += content[i].text;
			}
			return out;
		}

		// ── Definition: one-shot node on a triggering user message ──
		var dashboardDefinition = {
			kind: "research-dashboard",
			target: "chat",
			match: function (event) {
				if (event.type !== "user/message") return null;
				if (!isTrigger(userText(event))) return null;
				return { id: String(event.seq), role: "start" };
			},
			start: function (_context, match) {
				return { at: match.event.seq, triggered: true };
			},
			update: function (context) { return context.state; },
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.triggered) return null;
				return {
					key: context.key,
					kind: "research-dashboard",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.at,
					location: context.matches && context.matches[0] && context.matches[0].location
						? context.matches[0].location
						: { kind: "unresolved" },
					visibility: "visible",
					data: {},
				};
			},
		};

		// ── Renderer: self-fetching statistics panel ──
		function DashboardView(props) {
			var state = React.useState({ loading: true, projects: 0, papers: 0, plan: null, list: [], error: null });
			var data = state[0];
			var setData = state[1];
			React.useEffect(function () {
				var cancelled = false;
				function load() {
					return fetch("/research-project?page=0&size=100", { credentials: "include" })
						.then(function (r) { return r.json(); })
						.then(function (pj) {
							if (cancelled) return;
							if (!pj || pj.code !== 0) {
								setData({ loading: false, projects: 0, papers: 0, plan: null, list: [], error: pj && pj.code === 401 ? "sign in" : "api err" });
								return;
							}
							var projects = pj.data.items || [];
							var sum = 0;
							var counts = {};
							var chain = Promise.resolve();
							projects.forEach(function (p) {
								chain = chain.then(function () {
									return fetch("/research-paper/projects/" + p.id + "/papers?folderId=-1&page=0&size=1", { credentials: "include" })
										.then(function (r) { return r.json(); })
										.then(function (pp) {
											if (!cancelled && pp && pp.code === 0 && pp.data) {
												counts[p.id] = pp.data.total;
												sum += pp.data.total;
											}
										})
										.catch(function () {});
								});
							});
							return chain.then(function () {
								return fetch("/research-auth/me", { credentials: "include" }).then(function (r) { return r.json(); }).catch(function () { return null; });
							}).then(function (me) {
								if (cancelled) return;
								setData({
									loading: false,
									projects: pj.data.total,
									papers: sum,
									plan: me && me.code === 0 ? me.data.plan : null,
									list: projects.map(function (p) { return { id: p.id, name: p.name, papers: counts[p.id] || 0 }; }),
									error: null,
								});
							});
						})
						.catch(function () { if (!cancelled) setData({ loading: false, projects: 0, papers: 0, plan: null, list: [], error: "no api" }); });
				}
				load();
				return function () { cancelled = true; };
			}, []);

			if (data.loading) {
				return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: 12, margin: "8px 0", color: "var(--dsw-fg-muted, #888)", fontSize: 13 } }, "📊 加载统计中…");
			}
			var card = function (label, value) {
				return React.createElement("div", { style: { flex: 1, minWidth: 90, padding: 10, borderRadius: 8, background: "var(--dsw-surface-2, #f7f7f7)", border: "1px solid var(--dsw-border, #eee)" } },
					React.createElement("div", { style: { fontSize: 20, fontWeight: 700 } }, value),
					React.createElement("div", { style: { fontSize: 11, color: "var(--dsw-fg-muted, #888)" } }, label),
				);
			};
			var rows = (data.list || []).slice(0, 8).map(function (p) {
				return React.createElement("div", { key: p.id, style: { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--dsw-border, #f0f0f0)", fontSize: 13 } },
					React.createElement("span", null, p.name),
					React.createElement("span", { style: { color: "var(--dsw-fg-muted, #888)" } }, p.papers + " 篇"),
				);
			});
			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 10 } }, "📊 ResearchOS 统计" + (data.plan ? " · " + data.plan : "")),
				data.error ? React.createElement("div", { style: { fontSize: 12, color: "#c0392b" } }, "数据加载失败（" + data.error + "），请先登录 ResearchOS") : null,
				React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } },
					card("项目", data.projects),
					card("论文", data.papers),
				),
				rows.length ? React.createElement("div", { style: { marginTop: 4 } },
					React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: "var(--dsw-fg-muted, #999)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 } }, "最近项目"),
					rows,
				) : null,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(dashboardDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-dashboard" },
					DashboardView,
				);
			});
		};

		return module.exports;
	}
});
