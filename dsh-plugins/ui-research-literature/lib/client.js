// Phase 4 ui-research-literature — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node TRIGGERED BY A USER MESSAGE keyword
// (文献检索/搜文献/检索文献/literature/search paper). The renderer shows a
// search box calling GET /research-paper/search?q= (user-scoped) and lists the
// results (title / authors / year / status).
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-literature",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var TRIGGER = /(文献检索|搜文献|检索文献|查文献|literature|search\s+paper|检索论文)/i;

		// ── Definition: one-shot node on a triggering user message ──
		var literatureDefinition = {
			kind: "research-literature",
			target: "chat",
			match: function (event) {
				if (event.type !== "user/message") return null;
				var content = event.data && event.data.content;
				var text = "";
				if (Array.isArray(content)) {
					for (var i = 0; i < content.length; i++) {
						if (content[i] && content[i].type === "text") text += content[i].text;
					}
				}
				if (!TRIGGER.test(text)) return null;
				return { id: String(event.seq), role: "start" };
			},
			start: function (_context, match) {
				// Extract a search query if the user typed one after the keyword.
				var content = match.event.data && match.event.data.content;
				var text = "";
				if (Array.isArray(content)) {
					for (var i = 0; i < content.length; i++) {
						if (content[i] && content[i].type === "text") text += content[i].text;
					}
				}
				var m = TRIGGER.exec(text || "");
				var initialQuery = "";
				if (m) initialQuery = text.slice(m.index + m[0].length).replace(/^[:：,，\s]+/, "");
				return { at: match.event.seq, triggered: true, initialQuery: initialQuery };
			},
			update: function (context) { return context.state; },
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.triggered) return null;
				return {
					key: context.key,
					kind: "research-literature",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.at,
					location: context.matches && context.matches[0] && context.matches[0].location
						? context.matches[0].location
						: { kind: "unresolved" },
					visibility: "visible",
					data: { initialQuery: context.state.initialQuery },
				};
			},
		};

		// ── Renderer: literature search panel ──
		function LiteratureView(props) {
			var data = props.node.data || {};
			var queryState = React.useState(data.initialQuery || "");
			var query = queryState[0];
			var setQuery = queryState[1];
			var resultState = React.useState(null);
			var result = resultState[0];
			var setResult = resultState[1];
			var busyState = React.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];

			var doSearch = function (q) {
				var term = (q != null ? q : query).trim();
				if (!term || busy) return;
				setBusy(true);
				setResult(null);
				fetch("/research-paper/search?q=" + encodeURIComponent(term) + "&limit=20", { credentials: "include" })
					.then(function (r) { return r.json(); })
					.then(function (j) {
						if (j && j.code === 0) setResult({ ok: true, items: j.data.items || [], total: j.data.total });
						else setResult({ ok: false, text: (j && j.message) || "检索失败" });
					})
					.catch(function () { setResult({ ok: false, text: "网络错误" }); })
					.then(function () { setBusy(false); });
			};

			React.useEffect(function () {
				if (data.initialQuery) doSearch(data.initialQuery);
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

			var rows = null;
			if (result && result.ok) {
				rows = result.items.map(function (p) {
					var meta = [p.year, p.status, p.doi].filter(Boolean).join(" · ");
					return React.createElement("div", { key: p.id, style: { padding: "7px 0", borderBottom: "1px solid var(--dsw-border, #f0f0f0)" } },
						React.createElement("div", { style: { fontWeight: 600, fontSize: 13, lineHeight: 1.4 } }, p.title || "(no title)"),
						p.authors ? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)" } }, p.authors) : null,
						React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #999)" } }, meta),
					);
				});
				if (!rows.length) rows = React.createElement("div", { style: { fontSize: 13, color: "var(--dsw-fg-muted, #888)", padding: "8px 0" } }, "未找到匹配文献");
			}

			var inputStyle = { flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--dsw-border, #ddd)", fontSize: 13, fontFamily: "inherit", background: "var(--dsw-surface, #fff)", color: "var(--dsw-fg, #333)" };

				var countEl = result && result.ok
					? React.createElement("div", { style: { fontSize: 12, color: "var(--dsw-fg-muted, #888)", marginBottom: 4 } }, "共 " + result.total + " 篇")
					: null;
				var errorEl = result && !result.ok
					? React.createElement("div", { style: { fontSize: 12, color: "#c0392b", marginBottom: 4 } }, result.text)
					: null;
				return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "12px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
					React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "🔎 ResearchOS 文献检索"),
					React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 8 } },
						React.createElement("input", { value: query, onChange: function (e) { setQuery(e.target.value); }, onKeyDown: function (e) { if (e.key === "Enter") doSearch(); }, placeholder: "标题 / 作者 / DOI 关键词…", style: inputStyle }),
						React.createElement("button", { onClick: function () { doSearch(); }, disabled: busy, style: { padding: "6px 18px", borderRadius: 8, border: "none", background: "var(--dsw-accent, #2563eb)", color: "#fff", fontSize: 13, cursor: "pointer", opacity: busy ? 0.6 : 1 } }, busy ? "检索中…" : "检索"),
					),
					countEl,
					errorEl,
					rows,
				);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(literatureDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-literature" },
					LiteratureView,
				);
			});
		};

		return module.exports;
	}
});
