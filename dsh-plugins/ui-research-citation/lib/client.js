// Phase 4 ui-research-citation — browser half (hand-built in the dsh client
// bundle format consumed by window.__ModuleLoader__).
//
// v0.1: a conversation chat node that renders the research MCP literature_cite
// tool output (BibTeX / RIS text) as a formatted citation card with a
// copy-to-clipboard affordance. Same standard tool/call + tool/result event
// matching as ui-research-library / ui-research-paper.
window.__ModuleLoader__.load({
	id: "@researchos/ui-research-citation",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		var React = require("react");

		var CITE_TOOL = "mcp__research__literature_cite";

		// ── Definition: turn-scoped accumulator of the latest citation ──
		var citationDefinition = {
			kind: "research-citation",
			target: "chat",
			match: function (event) {
				if (event.type === "turn/start") return { id: String(event.data.turn), role: "start" };
				if (event.type === "tool/call") return { id: String(event.data.turn), role: "update" };
				if (event.type === "tool/result") return { id: String(event.data.turn), role: "update" };
				return null;
			},
			start: function (_context, match) {
				if (match.event.type !== "turn/start") throw new Error("research-citation requires turn/start");
				return { turn: match.event.data.turn, calls: {}, citations: [] };
			},
			update: function (context, match) {
				var ev = match.event;
				if (ev.type === "tool/call") {
					var name = ev.data && ev.data.name;
					if (name !== CITE_TOOL) return context.state;
					var calls = Object.assign({}, context.state.calls);
					calls[String(ev.data.callId)] = name;
					return { turn: context.state.turn, calls: calls, citations: context.state.citations };
				}
				if (ev.type !== "tool/result") return context.state;
				var msg = ev.data && ev.data.message;
				var callId = msg && msg.source && String(msg.source.callId);
				if (context.state.calls[callId] !== CITE_TOOL) return context.state;
				var item = msg && msg.content && msg.content[0];
				if (!item || item.isError === true) return context.state;
				var text = "";
				var payload = item.content;
				if (Array.isArray(payload)) {
					for (var i = 0; i < payload.length; i++) {
						if (payload[i] && payload[i].type === "text") text += payload[i].text;
					}
				}
				if (!text.trim()) return context.state;
				var citations = context.state.citations.slice();
				citations.push(text);
				return { turn: context.state.turn, calls: context.state.calls, citations: citations };
			},
			buildLocationData: function () { return null; },
			buildViewNode: function (context) {
				if (!context.state || !context.state.citations.length) return null;
				var location = context.start && context.start.location
					? context.start.location
					: (context.matches && context.matches[0] && context.matches[0].location
						? context.matches[0].location
						: { kind: "unresolved" });
				var anchorSeq = context.start
					? context.start.event.seq
					: (context.matches && context.matches[0] ? context.matches[0].event.seq : 0);
				return {
					key: context.key,
					kind: "research-citation",
					id: context.id,
					target: "chat",
					anchorSeq: anchorSeq,
					location: location,
					visibility: "visible",
					data: { citations: context.state.citations.slice(-3) },
				};
			},
		};

		// ── Renderer: formatted citation card(s) ──
		function CitationCardView(props) {
			var citations = props.node.data.citations || [];
			var blocks = citations.map(function (text, idx) {
				var state = React.useState("复制");
				var copied = state[0];
				var setCopied = state[1];
				var onCopy = function () {
					var done = function () { setCopied("已复制 ✓"); setTimeout(function () { setCopied("复制"); }, 1500); };
					try {
						if (navigator.clipboard && navigator.clipboard.writeText) {
							navigator.clipboard.writeText(text).then(done, done);
						} else {
							var ta = document.createElement("textarea");
							ta.value = text;
							document.body.appendChild(ta);
							ta.select();
							document.execCommand("copy");
							document.body.removeChild(ta);
							done();
						}
					} catch (e) { setCopied("复制失败"); }
				};
				return React.createElement("div", { key: idx, style: { marginBottom: 10 } },
					React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 } },
						React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "var(--dsw-fg-muted, #999)", textTransform: "uppercase", letterSpacing: 0.4 } },
							text.indexOf("@") === 0 ? "BibTeX" : "Citation"),
						React.createElement("button", { onClick: onCopy, style: { fontSize: 11, padding: "2px 10px", borderRadius: 6, border: "1px solid var(--dsw-border, #ddd)", background: "var(--dsw-surface-2, #f5f5f5)", cursor: "pointer", color: "var(--dsw-fg, #333)" } }, copied),
					),
					React.createElement("pre", { style: { margin: 0, padding: 10, borderRadius: 8, background: "var(--dsw-surface-2, #f7f7f7)", border: "1px solid var(--dsw-border, #eee)", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 } }, text),
				);
			});
			return React.createElement("div", { style: { border: "1px solid var(--dsw-border, #e5e5e5)", borderRadius: 10, padding: "10px 14px", margin: "8px 0", background: "var(--dsw-surface, #fff)" } },
				React.createElement("div", { style: { fontSize: 14, fontWeight: 700, marginBottom: 8 } }, "🔖 ResearchOS 引用"),
				blocks,
			);
		}

		exports.inject = ["conversationEvents", "slots"];
		exports.apply = function (ctx) {
			ctx.conversationEvents.register(citationDefinition);
			ctx.slots.inject("conversation.chat.node", function () {
				return ctx.slots.register(
					{ name: "conversation.chat.node", key: "research-citation" },
					CitationCardView,
				);
			});
		};

		return module.exports;
	}
});
